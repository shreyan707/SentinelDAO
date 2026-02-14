# backend/services/scanner.py

from transformers import pipeline
import os



print("Loading model...")
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
print("Ready.")

harmful_labels = [
    "direct personal attack insulting a specific person",
    "encouraging or telling someone to kill themselves or self-harm",
    "using the phrase kill yourself as an insult",
    "hate speech or discrimination against a group",
    "sexual harassment",
    "intimidation or blackmail or threat of violence",
    "toxic or aggressive language directed at someone",
]

severe_labels = [
    "encouraging or telling someone to kill themselves or self-harm",
    "using the phrase kill yourself as an insult",
    "intimidation or blackmail or threat of violence",
]

safe_labels = [
    "expressing personal pain or suicidal thoughts about oneself",
    "venting frustration about a situation without targeting anyone",
    "sharing a negative personal experience",
    "asking for help or support",
    "neutral or friendly conversation",
]

all_labels = harmful_labels + safe_labels

FLAG_THRESHOLD = 0.5

instant_flag_phrases = [
    "kill yourself", "kys", "go die", "end yourself",
    "hang yourself", "drink bleach", "neck yourself",
]

self_indicators = [
    "i want to", "i wanna", "i feel like",
    "i should", "i might", "makes me want to",
]


def check_instant_flag(message):
    msg_lower = message.lower().strip()
    for phrase in instant_flag_phrases:
        if phrase in msg_lower:
            for indicator in self_indicators:
                if indicator in msg_lower:
                    return False
            return True
    return False


def get_punishment(harmful_score, severe_score, warnings):
    if warnings < 2:
        if severe_score > 0.5:
            return "timeout_1minute"
        if harmful_score > 0.7:
            return "timeout_30sec"
        if harmful_score > 0.6:
            return "timeout_10sec"
        return "warning"
    else:
        if severe_score > 0.7:
            return "permanent_ban"
        if severe_score > 0.5:
            return "timeout_1minute"
        if harmful_score > 0.85:
            return "timeout_30sec"
        if harmful_score > 0.7:
            return "timeout_10sec"
        if harmful_score > 0.6:
            return "timeout_5sec"
        return "timeout_1hour"


def scan(message, warning_count=0):
    if check_instant_flag(message):
        punishment = get_punishment(0.9, 0.9, warning_count)
        return {
            "flagged": True,
            "reason": "encouraging self-harm or suicide",
            "harmful_score": 0.9,
            "severe_score": 0.9,
            "punishment": punishment,
        }

    result = classifier(message, candidate_labels=all_labels, multi_label=True)
    scores = dict(zip(result["labels"], result["scores"]))

    harmful_score = max(scores.get(l, 0) for l in harmful_labels)
    safe_score = max(scores.get(l, 0) for l in safe_labels)
    severe_score = max(scores.get(l, 0) for l in severe_labels)
    top_label = result["labels"][0]

    is_flagged = (
        top_label in harmful_labels
        and harmful_score > safe_score
        and harmful_score > FLAG_THRESHOLD
    )

    punishment = None
    if is_flagged:
        punishment = get_punishment(harmful_score, severe_score, warning_count)

    return {
        "flagged": is_flagged,
        "reason": top_label,
        "harmful_score": round(harmful_score, 4),
        "severe_score": round(severe_score, 4),
        "punishment": punishment,
    }
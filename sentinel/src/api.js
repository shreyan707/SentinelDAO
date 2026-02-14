// sentinel/src/lib/api.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function getCompleteMessages() {
  const res = await fetch(`${API_URL}/messages/complete?limit=100`);
  return res.json();
}

export async function getUserMessages(userId) {
  const res = await fetch(`${API_URL}/messages/by-user/${userId}?limit=50`);
  return res.json();
}

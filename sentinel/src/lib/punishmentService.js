import { supabase } from './supabase';

/**
 * Punishment Service
 * Handles all punishment-related operations (timeouts and bans)
 */

/**
 * Check if a user can post messages
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{canPost: boolean, reason: string|null}>}
 */
export async function canUserPost(walletAddress) {
    if (!walletAddress) {
        return { canPost: false, reason: 'No wallet connected' };
    }

    const status = await getPunishmentStatus(walletAddress);

    if (status.error) {
        // If we can't check status, allow posting (fail open)
        return { canPost: true, reason: null };
    }

    if (status.is_banned) {
        return {
            canPost: false,
            reason: `Permanently banned: ${status.ban_reason || 'Toxic behavior'}`
        };
    }

    if (status.is_timed_out) {
        const remaining = getRemainingTimeout(status.timeout_until);
        return {
            canPost: false,
            reason: `Timed out for ${remaining}`
        };
    }

    return { canPost: true, reason: null };
}

/**
 * Get punishment status for a user
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>}
 */
export async function getPunishmentStatus(walletAddress) {
    try {
        const { data, error } = await supabase
            .rpc('get_user_punishment_status', {
                p_wallet_address: walletAddress.toLowerCase()
            });

        if (error) {
            console.error('Error getting punishment status:', error);
            return { error: error.message };
        }

        return data || { can_post: true };
    } catch (err) {
        console.error('Exception getting punishment status:', err);
        return { error: err.message };
    }
}

/**
 * Assign punishment to a user (called after moderation decision)
 * @param {string} userId - User's UUID
 * @param {string} walletAddress - User's wallet address
 * @param {string} caseId - Moderation case UUID
 * @param {string} reason - Reason for punishment
 * @param {number} severeScore - Severity score (0-1)
 * @returns {Promise<Object>}
 */
export async function assignPunishment(userId, walletAddress, caseId, reason, severeScore = 0) {
    try {
        const { data, error } = await supabase
            .rpc('assign_punishment', {
                p_user_id: userId,
                p_wallet_address: walletAddress.toLowerCase(),
                p_case_id: caseId,
                p_reason: reason,
                p_severe_score: severeScore
            });

        if (error) {
            console.error('Error assigning punishment:', error);
            return { success: false, error: error.message };
        }

        return data;
    } catch (err) {
        console.error('Exception assigning punishment:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get punishment history for a user
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Array>}
 */
export async function getPunishmentHistory(walletAddress) {
    try {
        const { data, error } = await supabase
            .from('user_punishments')
            .select('*')
            .eq('wallet_address', walletAddress.toLowerCase())
            .order('issued_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error getting punishment history:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Exception getting punishment history:', err);
        return [];
    }
}

/**
 * Calculate remaining timeout duration in human-readable format
 * @param {string|Date} timeoutUntil - Timeout expiration timestamp
 * @returns {string}
 */
export function getRemainingTimeout(timeoutUntil) {
    if (!timeoutUntil) return 'unknown duration';

    const now = new Date();
    const until = new Date(timeoutUntil);
    const diffMs = until - now;

    if (diffMs <= 0) return 'expired';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Manually trigger timeout expiration (useful for testing)
 * @returns {Promise<void>}
 */
export async function expireTimeouts() {
    try {
        const { error } = await supabase.rpc('expire_timeouts');
        if (error) {
            console.error('Error expiring timeouts:', error);
        }
    } catch (err) {
        console.error('Exception expiring timeouts:', err);
    }
}

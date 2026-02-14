import { useState, useEffect } from 'react';
import { getRemainingTimeout } from '../lib/punishmentService';

/**
 * PunishmentBanner Component
 * Displays ban or timeout status to users who are restricted
 */
export default function PunishmentBanner({ punishmentStatus, onExpire }) {
    const [timeRemaining, setTimeRemaining] = useState('');

    useEffect(() => {
        if (punishmentStatus?.is_timed_out && punishmentStatus?.timeout_until) {
            // Update countdown every minute
            const updateCountdown = () => {
                const remaining = getRemainingTimeout(punishmentStatus.timeout_until);
                setTimeRemaining(remaining);

                if (remaining === 'expired' && onExpire) {
                    onExpire();
                }
            };

            updateCountdown();
            const interval = setInterval(updateCountdown, 60000); // Update every minute

            return () => clearInterval(interval);
        }
    }, [punishmentStatus, onExpire]);

    if (!punishmentStatus) return null;

    // Permanent ban
    if (punishmentStatus.is_banned) {
        return (
            <div
                style={{
                    backgroundColor: '#7f1d1d',
                    borderLeft: '4px solid #dc2626',
                    padding: '16px 20px',
                    margin: '16px 0',
                    borderRadius: '8px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '32px' }}>🚫</span>
                    <div style={{ flex: 1 }}>
                        <h3
                            style={{
                                color: '#fca5a5',
                                fontSize: '16px',
                                fontWeight: '600',
                                margin: '0 0 4px 0',
                            }}
                        >
                            Account Permanently Banned
                        </h3>
                        <p
                            style={{
                                color: '#fecaca',
                                fontSize: '14px',
                                margin: 0,
                            }}
                        >
                            {punishmentStatus.ban_reason || 'Repeated violations of community guidelines'}
                        </p>
                        {punishmentStatus.warnings && (
                            <p
                                style={{
                                    color: '#fca5a5',
                                    fontSize: '12px',
                                    margin: '8px 0 0 0',
                                    opacity: 0.8,
                                }}
                            >
                                Warnings received: {punishmentStatus.warnings}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Timeout
    if (punishmentStatus.is_timed_out) {
        return (
            <div
                style={{
                    backgroundColor: '#7c2d12',
                    borderLeft: '4px solid #f97316',
                    padding: '16px 20px',
                    margin: '16px 0',
                    borderRadius: '8px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '32px' }}>⏰</span>
                    <div style={{ flex: 1 }}>
                        <h3
                            style={{
                                color: '#fed7aa',
                                fontSize: '16px',
                                fontWeight: '600',
                                margin: '0 0 4px 0',
                            }}
                        >
                            Temporarily Timed Out
                        </h3>
                        <p
                            style={{
                                color: '#fde68a',
                                fontSize: '14px',
                                margin: 0,
                            }}
                        >
                            You cannot post messages for {timeRemaining}
                        </p>
                        {punishmentStatus.warnings && (
                            <p
                                style={{
                                    color: '#fed7aa',
                                    fontSize: '12px',
                                    margin: '8px 0 0 0',
                                    opacity: 0.8,
                                }}
                            >
                                ⚠️ Warnings: {punishmentStatus.warnings} - Next violation may result in a ban
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

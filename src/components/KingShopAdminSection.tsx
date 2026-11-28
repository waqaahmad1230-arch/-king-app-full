import React, { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  Save,
  RefreshCw,
  Ticket,
  Activity,
  Gamepad2,
  Target,
  ShieldCheck,
  Loader2,
  ShoppingBag,
  Crown,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import {
  fetchKingShopAdminOverview,
  updateKingShopAdminSettings,
  updateKingShopCouponStatus,
  verifyAdminOrder,
  adjustAdminUserWallet,
  overrideAdminUserVip,
  type KingShopAdminSettingsPayload,
  type KingShopCoupon,
  type KingShopTransaction,
  type KingShopOrderSummary,
  type KingShopAdminVipProfileSummary,
  type KingShopAdminAuditEntry,
  type VipTierId,
} from '../services/kingShopFrontendService';

interface KingShopAdminSectionProps {
  isSuperAdminAuthed: boolean;
  showToast: (msg: string) => void;
}

export function KingShopAdminSection({ isSuperAdminAuthed, showToast }: KingShopAdminSectionProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'orders' | 'vip' | 'wallet' | 'coupons' | 'audit'>('settings');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<KingShopAdminSettingsPayload | null>(null);
  const [transactions, setTransactions] = useState<KingShopTransaction[]>([]);
  const [coupons, setCoupons] = useState<KingShopCoupon[]>([]);
  const [orders, setOrders] = useState<KingShopOrderSummary[]>([]);
  const [vipProfiles, setVipProfiles] = useState<KingShopAdminVipProfileSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<KingShopAdminAuditEntry[]>([]);

  // Filters & State for Sub-sections
  const [couponFilter, setCouponFilter] = useState<'all' | 'active' | 'reserved' | 'used' | 'expired'>('all');
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending_whatsapp' | 'confirmed' | 'cancelled' | 'refunded'>('all');
  const [updatingCouponId, setUpdatingCouponId] = useState<string | null>(null);

  // Order action state
  const [orderActionLoading, setOrderActionLoading] = useState<string | null>(null);
  const [orderActionNote, setOrderActionNote] = useState<Record<string, string>>({});
  const [orderRefundAmount, setOrderRefundAmount] = useState<Record<string, number>>({});

  // VIP manual override state
  const [vipOverrideUid, setVipOverrideUid] = useState('');
  const [vipOverrideTier, setVipOverrideTier] = useState<'auto' | VipTierId>('gold');
  const [vipOverrideReason, setVipOverrideReason] = useState('');
  const [vipOverrideSubmitting, setVipOverrideSubmitting] = useState(false);

  // Wallet adjustment state
  const [walletAdjustUid, setWalletAdjustUid] = useState('');
  const [walletAdjustAmount, setWalletAdjustAmount] = useState<number>(100);
  const [walletAdjustReason, setWalletAdjustReason] = useState('');
  const [walletAdjustIncludeWeekly, setWalletAdjustIncludeWeekly] = useState(false);
  const [walletAdjustSubmitting, setWalletAdjustSubmitting] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!isSuperAdminAuthed) return;
    setLoading(true);
    try {
      const data = await fetchKingShopAdminOverview();
      setSettings(data.settings);
      setTransactions(data.transactions || []);
      setCoupons(data.coupons || []);
      setOrders(data.orders || []);
      setVipProfiles(data.vipProfiles || []);
      setAuditLogs(data.auditLogs || []);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load KING Shop Rewards admin data.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdminAuthed, showToast]);

  useEffect(() => {
    if (isSuperAdminAuthed) {
      void loadOverview();
    }
  }, [isSuperAdminAuthed, loadOverview]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || saving) return;
    setSaving(true);
    try {
      const res = await updateKingShopAdminSettings(settings);
      setSettings(res.settings);
      showToast('KING Shop reward settings saved successfully!');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save reward settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCouponStatusChange = async (
    couponId: string,
    nextStatus: 'active' | 'used' | 'revoked',
    orderRef?: string
  ) => {
    setUpdatingCouponId(couponId);
    try {
      await updateKingShopCouponStatus(couponId, nextStatus, orderRef);
      await loadOverview();
      showToast(`Coupon marked ${nextStatus}.`);
    } catch (err: any) {
      showToast(err?.message || 'Coupon update failed.');
    } finally {
      setUpdatingCouponId(null);
    }
  };

  const handleOrderVerification = async (
    orderRef: string,
    action: 'confirm_paid' | 'cancel' | 'refund'
  ) => {
    setOrderActionLoading(orderRef);
    try {
      const note = orderActionNote[orderRef]?.trim() || '';
      const refundAmount = orderRefundAmount[orderRef];
      await verifyAdminOrder({
        orderRef,
        action,
        note: note || undefined,
        refundAmount: action === 'refund' && typeof refundAmount === 'number' ? refundAmount : undefined,
      });
      showToast(`Order ${orderRef} updated: ${action.replace('_', ' ').toUpperCase()}`);
      await loadOverview();
    } catch (err: any) {
      showToast(err?.message || `Failed to process order action.`);
    } finally {
      setOrderActionLoading(null);
    }
  };

  const handleVipOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipOverrideUid.trim() || vipOverrideReason.trim().length < 3) {
      showToast('Please provide target UID and a reason with at least 3 characters.');
      return;
    }
    setVipOverrideSubmitting(true);
    try {
      await overrideAdminUserVip({
        targetUid: vipOverrideUid.trim(),
        tier: vipOverrideTier,
        reason: vipOverrideReason.trim(),
      });
      showToast(`VIP tier for UID ${vipOverrideUid.trim().slice(0, 8)} set to ${vipOverrideTier}.`);
      setVipOverrideUid('');
      setVipOverrideReason('');
      await loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'VIP tier override failed.');
    } finally {
      setVipOverrideSubmitting(false);
    }
  };

  const handleWalletAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAdjustUid.trim() || walletAdjustReason.trim().length < 3) {
      showToast('Please provide target UID and an audit reason (min 3 chars).');
      return;
    }
    if (walletAdjustAmount === 0 || isNaN(walletAdjustAmount)) {
      showToast('Adjustment amount must not be zero.');
      return;
    }
    setWalletAdjustSubmitting(true);
    try {
      const res = await adjustAdminUserWallet({
        targetUid: walletAdjustUid.trim(),
        amount: walletAdjustAmount,
        reason: walletAdjustReason.trim(),
        includeInWeekly: walletAdjustIncludeWeekly,
      });
      showToast(`Wallet adjusted: ${res.amount >= 0 ? `+${res.amount}` : res.amount} Coins. New balance: ${res.balance}`);
      setWalletAdjustUid('');
      setWalletAdjustReason('');
      await loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Wallet adjustment failed.');
    } finally {
      setWalletAdjustSubmitting(false);
    }
  };

  const filteredCoupons = coupons.filter((c) =>
    couponFilter === 'all' ? true : c.status === couponFilter
  );

  const filteredOrders = orders.filter((o) =>
    orderFilter === 'all' ? true : o.status === orderFilter
  );

  return (
    <div className="pt-4 mt-4 border-t border-slate-800 space-y-3">
      {/* Admin Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">
              KING Coins &amp; Rewards Controls
            </h4>
            <p className="text-[10px] text-slate-400">
              Economy Caps, Streak, Arcade, Orders, VIP &amp; Security Audits
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={!isSuperAdminAuthed || loading}
          onClick={() => void loadOverview()}
          className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!isSuperAdminAuthed ? (
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Sign in with verified Super Admin Google account above to manage KING Coins settings and transactions.</span>
        </div>
      ) : (
        <>
          {/* Admin Sub-tabs Navigation */}
          <div className="grid grid-cols-6 gap-1 bg-[#050a14] p-1 rounded-xl border border-slate-800 text-center">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-black cursor-pointer transition truncate ${
                activeTab === 'settings' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-black cursor-pointer transition truncate ${
                activeTab === 'orders' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vip')}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-black cursor-pointer transition truncate ${
                activeTab === 'vip' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              VIP Loyalty
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-black cursor-pointer transition truncate ${
                activeTab === 'wallet' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Wallet Adj
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('coupons')}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-black cursor-pointer transition truncate ${
                activeTab === 'coupons' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Coupons ({coupons.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-black cursor-pointer transition truncate ${
                activeTab === 'audit' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Audit &amp; Logs
            </button>
          </div>

          {loading && !settings ? (
            <div className="py-6 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400 mx-auto" />
            </div>
          ) : null}

          {/* ==================================================================== */}
          {/* TAB 1: REWARD SETTINGS, ECONOMY CAPS, STREAK & GAME POLICIES       */}
          {/* ==================================================================== */}
          {activeTab === 'settings' && settings && (
            <form onSubmit={handleSaveSettings} className="space-y-3">
              {/* Program Master Status */}
              <div className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">Rewards Program Master Status</span>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.rewardsEnabled}
                      onChange={(e) =>
                        setSettings({ ...settings, rewardsEnabled: e.target.checked })
                      }
                      className="rounded border-slate-700"
                    />
                    Enabled
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400">Welcome Bonus Coins</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={settings.welcomeBonusCoins}
                      onChange={(e) =>
                        setSettings({ ...settings, welcomeBonusCoins: Number(e.target.value) || 0 })
                      }
                      className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400">Daily Base Check-In Coins</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={settings.dailyCheckinCoins}
                      onChange={(e) =>
                        setSettings({ ...settings, dailyCheckinCoins: Number(e.target.value) || 1 })
                      }
                      className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Economy & Anti-Inflation Daily Caps */}
              <div className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2.5">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" /> Economy &amp; Anti-Inflation Daily Caps
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400">
                    Global Daily Earn Cap (Total coins any user can earn/day)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    value={settings.economyConfig?.globalDailyEarnCap ?? 700}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        economyConfig: {
                          ...settings.economyConfig,
                          globalDailyEarnCap: Number(e.target.value) || 700,
                          sourceDailyCaps: settings.economyConfig?.sourceDailyCaps || {
                            checkin: 150,
                            game: 400,
                            mission: 200,
                            achievement: 500,
                          },
                        },
                      })
                    }
                    className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400">Check-in Cap</label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={settings.economyConfig?.sourceDailyCaps?.checkin ?? 150}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          economyConfig: {
                            ...settings.economyConfig,
                            sourceDailyCaps: {
                              ...settings.economyConfig.sourceDailyCaps,
                              checkin: Number(e.target.value) || 150,
                            },
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Arcade Games Cap</label>
                    <input
                      type="number"
                      min={50}
                      max={1000}
                      value={settings.economyConfig?.sourceDailyCaps?.game ?? 400}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          economyConfig: {
                            ...settings.economyConfig,
                            sourceDailyCaps: {
                              ...settings.economyConfig.sourceDailyCaps,
                              game: Number(e.target.value) || 400,
                            },
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Missions Cap</label>
                    <input
                      type="number"
                      min={50}
                      max={1000}
                      value={settings.economyConfig?.sourceDailyCaps?.mission ?? 200}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          economyConfig: {
                            ...settings.economyConfig,
                            sourceDailyCaps: {
                              ...settings.economyConfig.sourceDailyCaps,
                              mission: Number(e.target.value) || 200,
                            },
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Achievements Cap</label>
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      value={settings.economyConfig?.sourceDailyCaps?.achievement ?? 500}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          economyConfig: {
                            ...settings.economyConfig,
                            sourceDailyCaps: {
                              ...settings.economyConfig.sourceDailyCaps,
                              achievement: Number(e.target.value) || 500,
                            },
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Streak Configuration */}
              <div className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2.5">
                <div className="text-xs font-black text-amber-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Progressive Streak &amp; Timezone
                  </span>
                  <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.streakConfig?.useProgressiveSchedule ?? true}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          streakConfig: {
                            ...settings.streakConfig,
                            useProgressiveSchedule: e.target.checked,
                          },
                        })
                      }
                    />
                    Progressive
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400">Timezone</label>
                    <input
                      type="text"
                      value={settings.streakConfig?.timezone || 'Asia/Karachi'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          streakConfig: {
                            ...settings.streakConfig,
                            timezone: e.target.value || 'Asia/Karachi',
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Day 7 Bonus</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={settings.streakConfig?.day7BonusCoins ?? 50}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          streakConfig: {
                            ...settings.streakConfig,
                            day7BonusCoins: Number(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Grace Days</label>
                    <input
                      type="number"
                      min={0}
                      max={7}
                      value={settings.streakConfig?.graceDays ?? 1}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          streakConfig: {
                            ...settings.streakConfig,
                            graceDays: Number(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Missed Day Policy</label>
                    <select
                      value={
                        settings.streakConfig?.missedDayResetPolicy === 'reset_to_1'
                          ? 'reset_to_day_1'
                          : settings.streakConfig?.missedDayResetPolicy || 'decrement_by_one'
                      }
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          streakConfig: {
                            ...settings.streakConfig,
                            missedDayResetPolicy: e.target.value as any,
                          },
                        })
                      }
                      className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    >
                      <option value="decrement_by_one">Decrement by 1</option>
                      <option value="reset_to_day_1">Reset to 1 (Day 1)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400">
                    7-Day Schedule Coins (Days 1–7 comma-separated)
                  </label>
                  <input
                    type="text"
                    value={(settings.streakConfig?.schedule || [20, 25, 35, 40, 50, 60, 100]).join(', ')}
                    onChange={(e) => {
                      const vals = e.target.value
                        .split(',')
                        .map((v) => parseInt(v.trim(), 10))
                        .filter((v) => !isNaN(v) && v > 0);
                      if (vals.length > 0) {
                        setSettings({
                          ...settings,
                          streakConfig: {
                            ...settings.streakConfig,
                            schedule: vals,
                          },
                        });
                      }
                    }}
                    className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-mono"
                  />
                </div>
              </div>

              {/* Mini-Games Configuration */}
              <div className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Gamepad2 className="w-3.5 h-3.5" /> KING Arcade 5 Games Limits
                </div>

                {/* Spin */}
                <div className="p-2 rounded-lg bg-[#091122] border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.games.spin.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            games: {
                              ...settings.games,
                              spin: { ...settings.games.spin, enabled: e.target.checked },
                            },
                          })
                        }
                      />
                      Lucky Spin
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Plays/Day:</span>
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={settings.games.spin.maxDailyPlays}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            games: {
                              ...settings.games,
                              spin: { ...settings.games.spin, maxDailyPlays: Number(e.target.value) || 1 },
                            },
                          })
                        }
                        className="w-12 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Quiz & Puzzle */}
                {(['quiz', 'puzzle'] as const).map((gKey) => (
                  <div
                    key={gKey}
                    className="p-2 rounded-lg bg-[#091122] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <label className="flex items-center gap-2 font-bold text-white cursor-pointer capitalize">
                      <input
                        type="checkbox"
                        checked={settings.games[gKey].enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            games: {
                              ...settings.games,
                              [gKey]: { ...settings.games[gKey], enabled: e.target.checked },
                            },
                          })
                        }
                      />
                      KING {gKey}
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-400 flex items-center gap-1">
                        Plays:
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={settings.games[gKey].maxDailyPlays}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              games: {
                                ...settings.games,
                                [gKey]: { ...settings.games[gKey], maxDailyPlays: Number(e.target.value) || 1 },
                              },
                            })
                          }
                          className="w-12 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400 flex items-center gap-1">
                        Coins:
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={settings.games[gKey].rewardCoins}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              games: {
                                ...settings.games,
                                [gKey]: { ...settings.games[gKey], rewardCoins: Number(e.target.value) || 1 },
                              },
                            })
                          }
                          className="w-14 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 font-bold"
                        />
                      </label>
                    </div>
                  </div>
                ))}

                {/* Scratch & Win */}
                {settings.games.scratch && (
                  <div className="p-2 rounded-lg bg-[#091122] border border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.games.scratch.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            games: {
                              ...settings.games,
                              scratch: { ...settings.games.scratch, enabled: e.target.checked },
                            },
                          })
                        }
                      />
                      Scratch &amp; Win (3x3)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-400 flex items-center gap-1">
                        Plays:
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={settings.games.scratch.maxDailyPlays}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              games: {
                                ...settings.games,
                                scratch: { ...settings.games.scratch, maxDailyPlays: Number(e.target.value) || 1 },
                              },
                            })
                          }
                          className="w-12 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400 flex items-center gap-1">
                        Max:
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={settings.games.scratch.maxCoins}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              games: {
                                ...settings.games,
                                scratch: { ...settings.games.scratch, maxCoins: Number(e.target.value) || 1 },
                              },
                            })
                          }
                          className="w-14 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 font-bold"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Memory Match */}
                {settings.games.memory && (
                  <div className="p-2 rounded-lg bg-[#091122] border border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.games.memory.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            games: {
                              ...settings.games,
                              memory: { ...settings.games.memory, enabled: e.target.checked },
                            },
                          })
                        }
                      />
                      Memory Match (12 cards)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-400 flex items-center gap-1">
                        Plays:
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={settings.games.memory.maxDailyPlays}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              games: {
                                ...settings.games,
                                memory: { ...settings.games.memory, maxDailyPlays: Number(e.target.value) || 1 },
                              },
                            })
                          }
                          className="w-12 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400 flex items-center gap-1">
                        Coins:
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={settings.games.memory.rewardCoins}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              games: {
                                ...settings.games,
                                memory: { ...settings.games.memory, rewardCoins: Number(e.target.value) || 1 },
                              },
                            })
                          }
                          className="w-14 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 font-bold"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* VIP Settings & Downgrade Policy */}
              {settings.vipConfig && (
                <div className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2.5">
                  <div className="text-xs font-black text-amber-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5" /> VIP Loyalty Program Settings
                    </span>
                    <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.vipConfig.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            vipConfig: { ...settings.vipConfig, enabled: e.target.checked },
                          })
                        }
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400">Downgrade Policy</label>
                      <select
                        value={settings.vipConfig.downgradePolicy || 'never'}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            vipConfig: {
                              ...settings.vipConfig,
                              downgradePolicy: e.target.value as any,
                            },
                          })
                        }
                        className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                      >
                        <option value="never">Never Downgrade (Lifetime Peak)</option>
                        <option value="recalculate_on_refund">Recalculate on Refund</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Max Multiplier Cap (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={settings.vipConfig.maxMultiplierPercent ?? 50}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            vipConfig: {
                              ...settings.vipConfig,
                              maxMultiplierPercent: Number(e.target.value) || 50,
                            },
                          })
                        }
                        className="w-full bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] font-black text-slate-400 uppercase">
                      Tier Minimum Spend (PKR) &amp; Multiplier
                    </div>
                    {(['silver', 'gold', 'platinum', 'diamond'] as const).map((tKey) => {
                      const tier = settings.vipConfig?.tiers?.[tKey];
                      if (!tier) return null;
                      return (
                        <div
                          key={tKey}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#091122] border border-slate-800 text-xs"
                        >
                          <span className="font-bold text-white capitalize w-20">{tier.label}</span>
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-400 flex items-center gap-1">
                              Spend:
                              <input
                                type="number"
                                min={0}
                                max={1000000}
                                value={tier.minSpend}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    vipConfig: {
                                      ...settings.vipConfig,
                                      tiers: {
                                        ...settings.vipConfig.tiers,
                                        [tKey]: { ...tier, minSpend: Number(e.target.value) || 0 },
                                      },
                                    },
                                  })
                                }
                                className="w-16 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white text-right"
                              />
                            </label>
                            <label className="text-[10px] text-slate-400 flex items-center gap-1">
                              Bonus %:
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={tier.multiplierPercent}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    vipConfig: {
                                      ...settings.vipConfig,
                                      tiers: {
                                        ...settings.vipConfig.tiers,
                                        [tKey]: { ...tier, multiplierPercent: Number(e.target.value) || 0 },
                                      },
                                    },
                                  })
                                }
                                className="w-12 bg-[#050a14] border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 font-bold text-right"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Redeem Catalog Tiers */}
              <div className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2">
                <div className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5" /> Redeem Catalog Tiers
                </div>
                <div className="space-y-2">
                  {Object.values(settings.rewardsCatalog).map((r) => (
                    <div
                      key={r.id}
                      className="text-xs bg-[#091122] p-2.5 rounded-lg border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                rewardsCatalog: {
                                  ...settings.rewardsCatalog,
                                  [r.id]: { ...r, enabled: e.target.checked },
                                },
                              })
                            }
                          />
                          <span className="font-bold text-white truncate">{r.title}</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400">Cost (Coins)</span>
                          <input
                            type="number"
                            min={10}
                            max={100000}
                            value={r.cost}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                rewardsCatalog: {
                                  ...settings.rewardsCatalog,
                                  [r.id]: { ...r, cost: Number(e.target.value) || 10 },
                                },
                              })
                            }
                            className="w-full bg-[#050a14] border border-slate-700 rounded px-2 py-1 text-xs text-emerald-300 font-bold"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Min Order (Rs.)</span>
                          <input
                            type="number"
                            min={0}
                            max={1000000}
                            value={r.minOrderAmount ?? 0}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                rewardsCatalog: {
                                  ...settings.rewardsCatalog,
                                  [r.id]: { ...r, minOrderAmount: Math.max(0, Number(e.target.value) || 0) },
                                },
                              })
                            }
                            className="w-full bg-[#050a14] border border-slate-700 rounded px-2 py-1 text-xs text-cyan-300 font-bold"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Valid (Days)</span>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={r.expiryDays ?? 30}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                rewardsCatalog: {
                                  ...settings.rewardsCatalog,
                                  [r.id]: { ...r, expiryDays: Math.max(1, Number(e.target.value) || 30) },
                                },
                              })
                            }
                            className="w-full bg-[#050a14] border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save All Reward Settings</span>
              </button>
            </form>
          )}

          {/* ==================================================================== */}
          {/* TAB 2: VERIFIED WHATSAPP ORDERS & ORDER LIFECYCLE CONTROLS         */}
          {/* ==================================================================== */}
          {activeTab === 'orders' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <span className="font-bold">Strict Order Verification Rule: </span>
                  WhatsApp link click alone NEVER verifies a purchase. Only manually clicking &quot;Confirm Paid&quot; below after verifying payment in your bank/easypaisa ledger credits the customer&apos;s VIP spend.
                </div>
              </div>

              {/* Order Filter Bar */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {(['all', 'pending_whatsapp', 'confirmed', 'cancelled', 'refunded'] as const).map((statusKey) => (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => setOrderFilter(statusKey)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer shrink-0 transition ${
                      orderFilter === statusKey
                        ? 'bg-amber-500/20 border border-amber-400/60 text-amber-200'
                        : 'bg-[#050a14] border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {statusKey.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {filteredOrders.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 bg-[#050a14] rounded-xl border border-slate-800">
                    No orders match this status filter.
                  </p>
                ) : (
                  filteredOrders.map((o) => {
                    const isProcessing = orderActionLoading === o.orderRef;
                    return (
                      <div
                        key={o.id}
                        className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-amber-300 flex items-center gap-1.5">
                            <ShoppingBag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            {o.orderRef}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              o.status === 'confirmed'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : o.status === 'pending_whatsapp'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : o.status === 'cancelled'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : o.status === 'refunded'
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                      : 'bg-neutral-800 text-slate-400'
                            }`}
                          >
                            {o.status.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="text-[11px] text-white font-medium">{o.itemSummary}</div>

                        <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>Customer: {o.uidPrefix}...</span>
                          <span>Subtotal: Rs.{o.subtotal.toLocaleString()}</span>
                          {o.couponCode && (
                            <span className="text-cyan-300 font-mono">
                              Coupon {o.couponCode} (-Rs.{o.discountAmount.toLocaleString()})
                            </span>
                          )}
                          <span className="font-black text-emerald-300">
                            Payable: Rs.{o.finalTotal.toLocaleString()}
                          </span>
                          {o.refundedAmount && o.refundedAmount > 0 ? (
                            <span className="text-purple-300 font-bold">
                              Refunded: Rs.{o.refundedAmount.toLocaleString()}
                            </span>
                          ) : null}
                          {o.vipCounted && (
                            <span className="text-amber-300 font-bold flex items-center gap-0.5">
                              <Crown className="w-2.5 h-2.5" /> VIP Spend Counted
                            </span>
                          )}
                        </div>

                        {o.verifiedAt && (
                          <div className="text-[9px] text-slate-500">
                            Verified by: {o.verifiedBy || 'Admin'} at {new Date(o.verifiedAt).toLocaleString()}
                            {o.verifiedNote ? ` • Note: ${o.verifiedNote}` : ''}
                          </div>
                        )}

                        {/* Order Verification Controls */}
                        {o.status === 'pending_whatsapp' && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                            <input
                              type="text"
                              placeholder="Optional audit verification note..."
                              value={orderActionNote[o.orderRef] || ''}
                              onChange={(e) =>
                                setOrderActionNote({
                                  ...orderActionNote,
                                  [o.orderRef]: e.target.value,
                                })
                              }
                              className="w-full bg-[#091122] border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => void handleOrderVerification(o.orderRef, 'confirm_paid')}
                                className="flex-1 py-1 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                              >
                                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Confirm Paid &amp; Add VIP Spend
                              </button>
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => void handleOrderVerification(o.orderRef, 'cancel')}
                                className="py-1 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                              >
                                <XCircle className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Refund option for confirmed orders */}
                        {o.status === 'confirmed' && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder={`Refund amount (max Rs.${o.finalTotal})`}
                                value={orderRefundAmount[o.orderRef] ?? o.finalTotal}
                                onChange={(e) =>
                                  setOrderRefundAmount({
                                    ...orderRefundAmount,
                                    [o.orderRef]: Number(e.target.value) || 0,
                                  })
                                }
                                className="w-32 bg-[#091122] border border-slate-700 rounded px-2 py-1 text-[11px] text-purple-300 font-bold"
                              />
                              <input
                                type="text"
                                placeholder="Audit note for refund reason..."
                                value={orderActionNote[o.orderRef] || ''}
                                onChange={(e) =>
                                  setOrderActionNote({
                                    ...orderActionNote,
                                    [o.orderRef]: e.target.value,
                                  })
                                }
                                className="flex-1 bg-[#091122] border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleOrderVerification(o.orderRef, 'refund')}
                              className="w-full py-1 px-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                            >
                              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                              Process Verified Refund (Deducts VIP Spend)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ==================================================================== */}
          {/* TAB 3: VIP PROFILES & MANUAL VIP TIER OVERRIDE                     */}
          {/* ==================================================================== */}
          {activeTab === 'vip' && (
            <div className="space-y-3">
              {/* Manual VIP Override Form */}
              <form onSubmit={handleVipOverrideSubmit} className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2.5">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" /> Manual VIP Tier Override
                </div>
                <p className="text-[10px] text-slate-400">
                  Instantly set or remove a customer&apos;s VIP tier. Requires a non-empty audit reason.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400">Target User UID</label>
                    <input
                      type="text"
                      placeholder="e.g. alice_uid_123 or paste customer UID"
                      value={vipOverrideUid}
                      onChange={(e) => setVipOverrideUid(e.target.value)}
                      className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400">Target VIP Tier</label>
                      <select
                        value={vipOverrideTier}
                        onChange={(e) => setVipOverrideTier(e.target.value as any)}
                        className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white capitalize font-bold"
                      >
                        <option value="auto">Auto (Reset to spend calculation)</option>
                        <option value="bronze">Bronze</option>
                        <option value="silver">Silver</option>
                        <option value="gold">Gold</option>
                        <option value="platinum">Platinum</option>
                        <option value="diamond">Diamond</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400">Mandatory Audit Reason</label>
                      <input
                        type="text"
                        placeholder="e.g. VIP Influencer, Customer service upgrade"
                        value={vipOverrideReason}
                        onChange={(e) => setVipOverrideReason(e.target.value)}
                        className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={vipOverrideSubmitting}
                    className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {vipOverrideSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Apply VIP Tier Override</span>
                  </button>
                </div>
              </form>

              {/* VIP Profiles List */}
              <div className="space-y-2">
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" /> Active VIP Customer Profiles ({vipProfiles.length})
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {vipProfiles.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4 bg-[#050a14] rounded-xl border border-slate-800">
                      No customer VIP profiles recorded yet.
                    </p>
                  ) : (
                    vipProfiles.map((v) => (
                      <div
                        key={v.uid}
                        className="p-2.5 rounded-xl bg-[#050a14] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-white text-[11px]">{v.uidPrefix}...</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300">
                              {v.tierLabel || v.tier}
                            </span>
                            {v.manualOverrideTier && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300">
                                Override: {v.manualOverrideTier}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Verified Spend: Rs.{v.verifiedSpendTotal.toLocaleString()} • Orders: {v.verifiedOrderCount}
                            {v.manualOverrideReason ? ` • &quot;${v.manualOverrideReason}&quot;` : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setVipOverrideUid(v.uid);
                            setVipOverrideTier(v.tier);
                          }}
                          className="px-2 py-1 rounded bg-[#091122] hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 cursor-pointer"
                        >
                          Select
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================== */}
          {/* TAB 4: MANUAL WALLET COIN ADJUSTMENT                               */}
          {/* ==================================================================== */}
          {activeTab === 'wallet' && (
            <div className="space-y-3">
              <form onSubmit={handleWalletAdjustSubmit} className="p-3 rounded-xl bg-[#050a14] border border-slate-800 space-y-2.5">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" /> Manual Wallet Coin Adjustment
                </div>
                <p className="text-[10px] text-slate-400">
                  Credit or debit user coins directly. Adjustments are logged to audit records and ledger. Negative balance is automatically prevented.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400">Target Customer UID</label>
                    <input
                      type="text"
                      placeholder="e.g. alice_uid_123 or paste user UID"
                      value={walletAdjustUid}
                      onChange={(e) => setWalletAdjustUid(e.target.value)}
                      className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400">Coins Amount (+ or -)</label>
                      <input
                        type="number"
                        placeholder="e.g. 250 or -100"
                        value={walletAdjustAmount}
                        onChange={(e) => setWalletAdjustAmount(Number(e.target.value) || 0)}
                        className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400">Audit Reason (min 3 chars)</label>
                      <input
                        type="text"
                        placeholder="e.g. VIP courtesy credit, Fraud reversal"
                        value={walletAdjustReason}
                        onChange={(e) => setWalletAdjustReason(e.target.value)}
                        className="w-full mt-0.5 bg-[#091122] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={walletAdjustIncludeWeekly}
                        onChange={(e) => setWalletAdjustIncludeWeekly(e.target.checked)}
                        className="rounded border-slate-700"
                      />
                      <span>Include in Weekly Leaderboard Score</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={walletAdjustSubmitting}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {walletAdjustSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Submit Wallet Adjustment</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ==================================================================== */}
          {/* TAB 5: ISSUED COUPONS & RESERVATIONS                               */}
          {/* ==================================================================== */}
          {activeTab === 'coupons' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {(['all', 'active', 'reserved', 'used', 'expired'] as const).map((statusKey) => (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => setCouponFilter(statusKey)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer shrink-0 transition ${
                      couponFilter === statusKey
                        ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-200'
                        : 'bg-[#050a14] border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {statusKey}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredCoupons.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 bg-[#050a14] rounded-xl border border-slate-800">
                    No matching coupons in this view.
                  </p>
                ) : (
                  filteredCoupons.map((c) => {
                    const orderRefDisplay = c.usedOrderRef || c.reservedOrderRef || c.orderRef;
                    return (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-xl bg-[#050a14] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white truncate">{c.title}</span>
                            {c.status === 'reserved' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-black uppercase">
                                Reserved
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-amber-300">{c.code}</div>
                          <div className="text-[10px] text-slate-500 truncate">
                            UID: {c.uid.slice(0, 8)}... • {c.cost} coins
                            {(c.minOrderAmount ?? 0) > 0 ? ` • Min Rs.${c.minOrderAmount}` : ''}
                            {orderRefDisplay ? ` • Ref ${orderRefDisplay}` : ''}
                            {c.reservedUntil && c.status === 'reserved'
                              ? ` • Hold until ${new Date(c.reservedUntil).toLocaleTimeString()}`
                              : c.expiresAt
                                ? ` • Exp ${new Date(c.expiresAt).toLocaleDateString()}`
                                : ''}
                          </div>
                        </div>
                        {c.status === 'expired' || c.status === 'used' ? (
                          <span
                            className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${
                              c.status === 'expired'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-neutral-800 text-slate-400 border border-neutral-700'
                            }`}
                          >
                            {c.status}
                          </span>
                        ) : (
                          <select
                            value={c.status}
                            disabled={updatingCouponId === c.id}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === 'active' || next === 'used' || next === 'revoked') {
                                void handleCouponStatusChange(
                                  c.id,
                                  next,
                                  c.reservedOrderRef || undefined
                                );
                              }
                            }}
                            className="bg-[#091122] border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-white cursor-pointer shrink-0"
                          >
                            {c.status === 'reserved' && (
                              <option value="reserved" disabled>
                                reserved
                              </option>
                            )}
                            <option value="active">active</option>
                            <option value="used">used</option>
                            <option value="revoked">revoked</option>
                          </select>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ==================================================================== */}
          {/* TAB 6: SECURITY AUDIT LOGS & TRANSACTION LEDGER                    */}
          {/* ==================================================================== */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              {/* Security Audit Records */}
              <div className="space-y-2">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Security &amp; Admin Audit Trail ({auditLogs.length})
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {auditLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3 bg-[#050a14] rounded-xl border border-slate-800">
                      No admin audit logs recorded yet.
                    </p>
                  ) : (
                    auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2 rounded-lg bg-[#050a14] border border-slate-800 text-xs space-y-0.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono font-bold text-cyan-300 uppercase">{log.action}</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          Target: {log.targetType} ({log.targetId || log.targetUid || log.orderRef || 'N/A'})
                          {log.amount !== undefined ? ` • Amount: ${log.amount}` : ''}
                          {log.tier ? ` • Tier: ${log.tier}` : ''}
                        </div>
                        {(log.reason || log.note) && (
                          <div className="text-[10px] text-slate-300 italic">
                            &quot;{log.reason || log.note}&quot; — {log.actorEmail || 'Admin'}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Transactions Ledger */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" /> Recent Coin Ledger ({transactions.length})
                </div>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {transactions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4 bg-[#050a14] rounded-xl border border-slate-800">
                      No coin transactions recorded yet.
                    </p>
                  ) : (
                    transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-2.5 rounded-xl bg-[#050a14] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="truncate">{tx.title}</span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            UID: {tx.uid.slice(0, 8)}... • {tx.type} • {new Date(tx.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                        <span
                          className={`font-black shrink-0 ${
                            tx.coins >= 0 ? 'text-amber-400' : 'text-rose-400'
                          }`}
                        >
                          {tx.coins >= 0 ? `+${tx.coins}` : tx.coins}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

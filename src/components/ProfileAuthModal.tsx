import React, { useState, useEffect } from 'react';
import { X, LogOut, CheckCircle, ShieldAlert, Users, Facebook, Mail } from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  FacebookAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface ProfileAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
}

interface UserAdConsent {
  uid: string;
  name: string;
  email: string;
  fb_auto_ads: boolean;
  consentedAt?: string;
  provider?: string;
}

export default function ProfileAuthModal({ isOpen, onClose, currentUser }: ProfileAuthModalProps) {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'admin'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Admin view data
  const [adApprovedUsers, setAdApprovedUsers] = useState<UserAdConsent[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [currentUser?.photoURL]);


  const { loginWithGoogle, loginWithFacebook } = useAuth();

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/user-cancelled' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        // user closed popup
      } else {
        setErrorMsg(err?.message || 'Google Sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      await loginWithFacebook();
      onClose();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/user-cancelled' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        // user closed popup
      } else if (err?.code === 'auth/operation-not-allowed') {
        setErrorMsg('Facebook sign-in is not enabled in Firebase Console (Authentication > Sign-in method). Please sign in using Google or Email.');
      } else {
        setErrorMsg(err?.message || 'Facebook Sign-in failed. Please try Google or Email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setErrorMsg('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        const name = email.split('@')[0];
        await setDoc(doc(db, 'users', res.user.uid), {
          uid: res.user.uid,
          name: name,
          email: email,
          provider: 'password',
          fb_auto_ads: false,
          createdAt: new Date().toISOString(),
        }, { merge: true });

        await setDoc(doc(db, 'publicProfiles', res.user.uid), {
          uid: res.user.uid,
          displayName: name,
          name: name,
          photoURL: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const loadAdminUsers = async () => {
    setLoadingAdmin(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserAdConsent[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.fb_auto_ads) {
          list.push({
            uid: data.uid || docSnap.id,
            name: data.name || 'Anonymous',
            email: data.email || 'N/A',
            fb_auto_ads: true,
            consentedAt: data.consentedAt,
            provider: data.provider,
          });
        }
      });
      setAdApprovedUsers(list);
    } catch (e) {
      console.error('Failed to load admin users', e);
    } finally {
      setLoadingAdmin(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <h3 className="text-base font-bold text-white">
              {currentUser ? 'KING Account' : 'Sign in to KING'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>


        {currentUser ? (
          /* User Profile View */
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
              {currentUser.photoURL && !avatarError && !currentUser.photoURL.includes('HsTZSDw4avx') && !currentUser.photoURL.includes('static.xx.fbcdn.net/rsrc.php') ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Profile'}
                  className="w-12 h-12 rounded-xl object-cover border border-amber-500/30"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="w-12 h-12 rounded-xl border border-amber-500/30 bg-gradient-to-tr from-amber-600/30 via-slate-800 to-cyan-500/20 flex items-center justify-center text-xl shadow-inner">
                  👑
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {currentUser.displayName || 'KING VIP User'}
                </div>
                <div className="text-xs text-slate-400 truncate">{currentUser.email}</div>
                <div className="text-[10px] text-amber-400 font-medium mt-0.5">VIP Member 👑</div>
              </div>
            </div>


            {/* Admin toggle */}
            <div className="pt-2">
              <button
                onClick={() => {
                  setAuthMode(authMode === 'admin' ? 'login' : 'admin');
                  if (authMode !== 'admin') loadAdminUsers();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-950/40 border border-purple-500/30 hover:bg-purple-900/40 text-purple-300 rounded-xl text-xs font-bold transition"
              >
                <Users className="w-3.5 h-3.5" />
                {authMode === 'admin' ? 'Hide Admin Auto-Ads List' : 'View Admin: Users with Auto-Ads'}
              </button>
            </div>

            {/* Admin Auto-Ads List */}
            {authMode === 'admin' && (
              <div className="p-3 bg-slate-950 rounded-2xl border border-purple-500/20 space-y-2">
                <div className="text-xs font-bold text-purple-300 flex items-center justify-between">
                  <span>Approved Users ({adApprovedUsers.length})</span>
                  <button onClick={loadAdminUsers} className="text-[10px] text-purple-400 hover:underline">
                    Refresh
                  </button>
                </div>
                {loadingAdmin ? (
                  <p className="text-xs text-slate-500 text-center py-2">Loading Firestore data...</p>
                ) : adApprovedUsers.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-2">
                    No users have approved Facebook auto-ads yet.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {adApprovedUsers.map((u) => (
                      <div key={u.uid} className="p-2 bg-slate-900 rounded-lg text-left text-xs border border-slate-800">
                        <div className="font-bold text-white truncate">{u.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                        <div className="text-[9px] text-emerald-400 mt-0.5">fb_auto_ads: true</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="w-full py-2.5 bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        ) : (
          /* Sign In View */
          <div className="mt-4 space-y-3">
            {errorMsg && (
              <div className="p-2.5 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            {/* Social Logins */}
            <div className="space-y-2">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white text-black rounded-xl text-xs font-bold hover:bg-slate-100 transition shadow-md"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <button
                onClick={handleFacebookLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-[#1877f2] hover:bg-[#166fe5] text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-900/30"
              >
                <Facebook className="w-4 h-4 fill-current" />
                Continue with Facebook
              </button>

            </div>

            <div className="flex items-center gap-2 my-3">
              <div className="h-[1px] flex-1 bg-slate-800" />
              <span className="text-[10px] text-slate-500 uppercase">Or Email</span>
              <div className="h-[1px] flex-1 bg-slate-800" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailAuth} className="space-y-2">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#070c17] text-white px-3 py-2 rounded-xl border border-slate-700/80 text-xs focus:outline-none focus:border-amber-400"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#070c17] text-white px-3 py-2 rounded-xl border border-slate-700/80 text-xs focus:outline-none focus:border-amber-400"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition"
              >
                {authMode === 'login' ? 'Sign In with Email' : 'Create Account'}
              </button>
            </form>

            <div className="text-center pt-1">
              <button
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-[11px] text-amber-400 hover:underline"
              >
                {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

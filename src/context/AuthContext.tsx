import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signOut, 
  signInWithPopup, 
  GoogleAuthProvider, 
  FacebookAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithFacebook: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: 'login' | 'signup';
  openAuthModal: (tab?: 'login' | 'signup') => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const isAuthPendingRef = useRef(false);

  useEffect(() => {
    // onAuthStateChanged listener:
    // If user.isAnonymous then signOut(auth) immediately. Otherwise setUser(currentUser).
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser?.isAnonymous) {
        console.warn("Anonymous auto-login detected - signing out immediately to force real login only.");
        try {
          await signOut(auth);
        } catch (err) {
          console.error("Error signing out anonymous user:", err);
        }
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    if (isAuthPendingRef.current) {
      console.log("Authentication popup already in progress, ignoring duplicate call.");
      return;
    }
    isAuthPendingRef.current = true;
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/youtube.upload');
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (result.user && !result.user.isAnonymous) {
        setUser(result.user);
        const displayName = result.user.displayName || 'Google User';
        const photoURL = result.user.photoURL || '';
        try {
          await setDoc(doc(db, 'users', result.user.uid), {
            uid: result.user.uid,
            name: displayName,
            email: result.user.email || '',
            photoURL: photoURL,
            provider: 'google',
            lastLogin: new Date().toISOString(),
          }, { merge: true });

          // Save public profile without sensitive fields
          await setDoc(doc(db, 'publicProfiles', result.user.uid), {
            uid: result.user.uid,
            displayName: displayName,
            name: displayName,
            photoURL: photoURL,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (e) {
          console.warn("Could not save user profile to Firestore:", e);
        }
      }
    } catch (e: any) {
      if (
        e?.code === 'auth/cancelled-popup-request' || 
        e?.code === 'auth/popup-closed-by-user' || 
        e?.code === 'auth/user-cancelled'
      ) {
        console.log("Google login cancelled or superseded.");
        return;
      }
      throw e;
    } finally {
      isAuthPendingRef.current = false;
    }
  };

  const [showFbAutoAdsPrompt, setShowFbAutoAdsPrompt] = useState(false);
  const [pendingFbUserUid, setPendingFbUserUid] = useState<string | null>(null);

  const updateFbAutoAdsConsent = async (approved: boolean) => {
    const uid = pendingFbUserUid || auth.currentUser?.uid;
    if (!uid) {
      setShowFbAutoAdsPrompt(false);
      return;
    }
    try {
      await setDoc(doc(db, 'users', uid), {
        fb_auto_ads: approved,
        consentedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn("Could not save fb_auto_ads consent:", err);
    } finally {
      setShowFbAutoAdsPrompt(false);
      setPendingFbUserUid(null);
    }
  };

  const loginWithFacebook = async () => {
    if (isAuthPendingRef.current) {
      console.log("Authentication popup already in progress, ignoring duplicate call.");
      return;
    }
    isAuthPendingRef.current = true;
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    provider.addScope('public_profile');
    try {
      const result = await signInWithPopup(auth, provider);
      
      if (!result.user || result.user.isAnonymous) return;

      // 1. Retrieve OAuth credential and Facebook access token
      let directCdnPhoto: string | null = null;
      let graphDisplayName: string | null = null;

      try {
        const credential = FacebookAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;

        if (accessToken) {
          const graphResponse = await fetch(
            `https://graph.facebook.com/me?fields=name,picture.width(500).height(500)&access_token=${encodeURIComponent(accessToken)}`
          );
          if (graphResponse.ok) {
            const graphData = await graphResponse.json();
            if (graphData?.name) {
              graphDisplayName = graphData.name;
            }
            const picData = graphData?.picture?.data;
            // Confirm that the returned URL points to the actual profile photo, NOT Facebook's generic silhouette
            if (
              picData?.url && 
              !picData.is_silhouette && 
              !picData.url.includes('static.xx.fbcdn.net/rsrc.php') &&
              !picData.url.includes('HsTZSDw4avx')
            ) {
              let cdnUrl = picData.url;
              if (cdnUrl.startsWith('http://')) {
                cdnUrl = cdnUrl.replace('http://', 'https://');
              }
              // Ensure no token is contained in the stored photo URL
              if (cdnUrl.includes('access_token')) {
                try {
                  const urlObj = new URL(cdnUrl);
                  urlObj.searchParams.delete('access_token');
                  cdnUrl = urlObj.toString();
                } catch {
                  cdnUrl = cdnUrl.replace(/([?&])access_token=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
                }
              }
              directCdnPhoto = cdnUrl;
            }
          }
        }
      } catch (graphErr) {
        console.warn("Could not retrieve Facebook profile picture via Graph API:", graphErr);
      }

      // 2. Resolve Facebook provider info from providerData
      const fbProvider = result.user.providerData?.find(p => p.providerId === 'facebook.com') || (result.user.providerData && result.user.providerData[0]);
      
      // Resolve display name: prefer user.displayName, then Graph API name, fallback to provider displayName
      const resolvedName = result.user.displayName || graphDisplayName || fbProvider?.displayName || null;

      // Resolve photoURL: prefer verified direct CDN photo, then user.photoURL, then fbProvider.photoURL
      let resolvedPhoto = directCdnPhoto || result.user.photoURL || fbProvider?.photoURL || null;

      // Filter out tokenless silhouette fallback URLs
      if (resolvedPhoto && (resolvedPhoto.includes('HsTZSDw4avx') || resolvedPhoto.includes('static.xx.fbcdn.net/rsrc.php'))) {
        resolvedPhoto = null;
      }

      // Ensure HTTPS protocol and large size if it is a Graph URL
      if (resolvedPhoto) {
        if (resolvedPhoto.startsWith('http://')) {
          resolvedPhoto = resolvedPhoto.replace('http://', 'https://');
        }
        if (resolvedPhoto.includes('graph.facebook.com')) {
          try {
            const urlObj = new URL(resolvedPhoto);
            urlObj.searchParams.set('type', 'large');
            resolvedPhoto = urlObj.toString();
          } catch {
            resolvedPhoto = resolvedPhoto.replace(/(\?|&)type=[^&]+/, '') + (resolvedPhoto.includes('?') ? '&' : '?') + 'type=large';
          }
        }
      }

      // 3. Synchronize Firebase Auth user profile object if needed
      if (resolvedName || resolvedPhoto) {
        try {
          await updateProfile(result.user, {
            ...(resolvedName && (!result.user.displayName || resolvedName !== result.user.displayName) ? { displayName: resolvedName } : {}),
            ...(resolvedPhoto && (!result.user.photoURL || resolvedPhoto !== result.user.photoURL) ? { photoURL: resolvedPhoto } : {})
          });
        } catch (profileErr) {
          console.warn("Could not sync Firebase Auth profile:", profileErr);
        }
      }

      // Update local react state immediately
      setUser({ ...result.user } as FirebaseUser);

      // 3. Check existing Firestore doc to avoid overwriting existing valid values with empty strings
      try {
        const userDoc = await getDoc(doc(db, 'users', result.user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;

        const finalName = resolvedName || userData?.name || userData?.displayName || result.user.displayName || 'Facebook User';
        const finalPhoto = resolvedPhoto || userData?.photoURL || result.user.photoURL || null;

        const userPayload: Record<string, any> = {
          uid: result.user.uid,
          name: finalName,
          email: result.user.email || userData?.email || '',
          provider: 'facebook',
          lastLogin: new Date().toISOString(),
        };
        if (finalPhoto) {
          userPayload.photoURL = finalPhoto;
        }

        await setDoc(doc(db, 'users', result.user.uid), userPayload, { merge: true });

        // Save public profile without sensitive fields
        const publicPayload: Record<string, any> = {
          uid: result.user.uid,
          displayName: finalName,
          name: finalName,
          updatedAt: new Date().toISOString(),
        };
        if (finalPhoto) {
          publicPayload.photoURL = finalPhoto;
        }

        await setDoc(doc(db, 'publicProfiles', result.user.uid), publicPayload, { merge: true });

        if (!userData || userData.fb_auto_ads === undefined) {
          setPendingFbUserUid(result.user.uid);
          setShowFbAutoAdsPrompt(true);
        }
      } catch (e) {
        console.warn("Could not save user profile to Firestore:", e);
      }
    } catch (e: any) {
      if (
        e?.code === 'auth/user-cancelled' || 
        e?.code === 'auth/cancelled-popup-request' || 
        e?.code === 'auth/popup-closed-by-user'
      ) {
        console.log("Facebook login cancelled by user.");
        return;
      }

      if (e?.code === 'auth/operation-not-allowed') {
        const friendlyMsg = "Facebook sign-in is not enabled in Firebase Console (Authentication > Sign-in method). Please sign in using Google or Email, or enable Facebook in Firebase Console.";
        console.warn("Firebase Auth Notice:", friendlyMsg);
        const error = new Error(friendlyMsg);
        (error as any).code = 'auth/operation-not-allowed';
        throw error;
      }

      if (e?.code === 'auth/account-exists-with-different-credential') {
        const friendlyMsg = "An account with this email address already exists. Please sign in with Google or Email.";
        console.warn("Firebase Auth Notice:", friendlyMsg);
        const error = new Error(friendlyMsg);
        (error as any).code = e.code;
        throw error;
      }

      console.warn("Facebook Login Notice:", e?.message || e);
      throw e;
    } finally {
      isAuthPendingRef.current = false;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
    if (result.user && !result.user.isAnonymous) {
      setUser(result.user);
    }
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (result.user && !result.user.isAnonymous) {
      setUser(result.user);
      const displayName = email.split('@')[0];
      try {
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          name: displayName,
          email: email.trim(),
          provider: 'password',
          fb_auto_ads: false,
          createdAt: new Date().toISOString(),
        }, { merge: true });

        // Save public profile without sensitive fields
        await setDoc(doc(db, 'publicProfiles', result.user.uid), {
          uid: result.user.uid,
          displayName: displayName,
          name: displayName,
          photoURL: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {
        console.warn("Could not save user profile to Firestore:", e);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("SignOut error:", e);
    }
    setUser(null);
    localStorage.removeItem("king_email");
    localStorage.removeItem("king_uid");
  };

  const openAuthModal = (tab: 'login' | 'signup' = 'login') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        loginWithFacebook,
        loginWithEmail,
        signUpWithEmail,
        logout,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}

      {/* Facebook Auto-Ads Posting Approval Prompt */}
      {showFbAutoAdsPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#0c1424] border border-blue-500/40 rounded-3xl p-5 shadow-2xl relative text-left">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
              <div className="w-8 h-8 rounded-full bg-[#1877f2] text-white flex items-center justify-center font-bold text-sm shadow">
                f
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Facebook Auto-Ads</h3>
                <p className="text-[10px] text-blue-400">Creator Monetization Approval</p>
              </div>
            </div>

            <div className="py-4 space-y-2.5">
              <p className="text-xs text-slate-300 leading-relaxed">
                Allow <strong>KING App</strong> to automatically post sponsored game offers & daily rewards with your Facebook account?
              </p>
              <div className="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 space-y-1">
                <div>✨ Earn up to 60% creator revenue split</div>
                <div>🛡️ You can change this anytime in Settings</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => updateFbAutoAdsConsent(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Not Now
              </button>
              <button
                type="button"
                onClick={() => updateFbAutoAdsConsent(true)}
                className="flex-1 py-2.5 bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition cursor-pointer"
              >
                Approve & Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

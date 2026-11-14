import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function WelcomeScreen() {
  const { loginWithGoogle, loginWithFacebook } = useAuth();

  return (
    <div className="fixed inset-0 z-50 bg-[#040812] flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-10 animate-in zoom-in duration-500">
        <div className="w-28 h-28 rounded-3xl bg-black/30 border-2 border-[#FFD700] shadow-[0_0_30px_rgba(255,215,0,0.5)] overflow-hidden p-1 flex items-center justify-center">
          <img src="/logo.png" alt="KING Logo" className="w-full h-full object-cover rounded-2xl" />
        </div>
        <h1 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-amber-200 to-yellow-500 uppercase mt-4">
          KING
        </h1>
        <p className="text-sm text-slate-400 mt-2">Welcome to your Gaming & Entertainment Vault</p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => loginWithGoogle()}
          className="w-full flex items-center justify-center gap-3 py-3 bg-white text-black rounded-2xl text-sm font-bold shadow-lg hover:bg-slate-100 transition active:scale-95"
        >
          Continue with Google
        </button>

        <button
          onClick={() => loginWithFacebook()}
          className="w-full flex items-center justify-center gap-3 py-3 bg-[#1877F2] text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-[#166fe5] transition active:scale-95"
        >
          Continue with Facebook
        </button>
      </div>
    </div>
  );
}

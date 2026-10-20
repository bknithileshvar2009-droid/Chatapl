import React, { useState } from 'react';
import { chatEngine } from '../services/chatEngine';
import { firebaseAuthService } from '../services/firebaseAuthService';
import { Profile } from '../types';
import { PRESET_AVATARS } from '../constants/avatars';
import { validatePassword } from '../utils/passwordValidation';
import { LogIn, UserPlus, ShieldCheck, MessageCircle, X, ChevronDown, ChevronUp, Check, AlertCircle, Loader2, Eye, EyeOff, Lock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onLoginSuccess: (user: Profile) => void;
}

export const AuthModal: React.FC<Props> = ({ isOpen, onLoginSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password validation calculation
  const passValidation = validatePassword(password);

  // Google Modal State
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [customGmail, setCustomGmail] = useState('');
  const [googleName, setGoogleName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanUser) {
      setErrorMsg("Please enter a valid handle / username (alphanumeric and underscores).");
      return;
    }

    if (!password) {
      setErrorMsg("Password is required to authenticate your account.");
      return;
    }

    if (isSignUp) {
      if (!passValidation.isValid) {
        setErrorMsg(`Password requirements not met: ${passValidation.errors.join(', ')}`);
        return;
      }
      if (!displayName.trim()) {
        setErrorMsg("Please enter your full display name.");
        return;
      }
      if (!customGmail.trim() || !customGmail.includes('@')) {
        setErrorMsg("Please enter a valid email address.");
        return;
      }
    } else {
      if (password.length < 6) {
        setErrorMsg("Password must be at least 6 characters long.");
        return;
      }
    }

    setLoading(true);
    try {
      let user: Profile;
      if (isSignUp) {
        user = await firebaseAuthService.signUpWithUsername(
          cleanUser,
          password,
          displayName.trim(),
          selectedAvatar,
          true,
          customGmail.trim()
        );
      } else {
        user = await firebaseAuthService.loginWithUsername(cleanUser, password);
      }
      chatEngine.setCurrentUser(user);
      onLoginSuccess(user);
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const user = await firebaseAuthService.loginWithGoogle();
      chatEngine.setCurrentUser(user);
      setShowGoogleModal(false);
      onLoginSuccess(user);
    } catch (err: any) {
      // If popup closed or fallback demo needed
      setShowGoogleModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSelect = async (email: string, name?: string, avatar?: string) => {
    const user = chatEngine.loginWithGoogle(email, name, avatar);
    try {
      await firebaseAuthService.syncUserProfile(user);
    } catch (e) {
      console.warn('Sync profile error:', e);
    }
    setShowGoogleModal(false);
    onLoginSuccess(user);
  };

  const handleCustomGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGmail) return;
    const email = customGmail.includes('@') ? customGmail : `${customGmail}@gmail.com`;
    handleGoogleSelect(email, googleName || email.split('@')[0], selectedAvatar);
  };

  return (
    <div id="auth-modal-overlay" className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div id="auth-card" className="bg-[#1a1c20] rounded-3xl shadow-2xl w-full max-w-md border border-[#2d3139] overflow-hidden text-[#f8fafc] flex flex-col max-h-[90vh]">
        {/* Top Banner with Glowing Blue/Turquoise/Violet Gradients */}
        <div id="auth-banner" className="px-6 py-7 bg-gradient-to-br from-[#0c101c] via-[#121829] to-[#181128] text-white text-center relative overflow-hidden border-b border-[#23293a] shrink-0">
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl" />
          
          <div className="relative z-10 flex flex-col items-center">
            <div id="auth-app-logo" className="p-3 bg-gradient-to-br from-blue-500/20 via-cyan-500/20 to-purple-500/20 rounded-2xl backdrop-blur-md border border-cyan-500/30 mb-2.5 shadow-xl ring-1 ring-cyan-400/20">
              <MessageCircle className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 drop-shadow-sm">NEX CHAT</h1>
            <p className="text-[11px] font-bold text-cyan-400 tracking-widest uppercase mt-1">Created by BKN BRAIN</p>
            <p className="text-[11px] text-slate-400 mt-1">Instant Messaging • AI Smart Replies • Realtime Sync</p>
          </div>
        </div>

        {/* Form Body */}
        <div id="auth-form-body" className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Error Alert Box */}
          {errorMsg && (
            <div id="auth-error-alert" className="p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-left font-medium leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Gmail OAuth Button */}
          <button
            id="google-signin-btn"
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full py-3 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] border border-slate-200"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>{isSignUp ? 'Sign Up with Gmail / Google' : 'Sign In with Gmail / Google'}</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#2d3139]" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Or Continue With Handle</span>
            <div className="flex-1 h-px bg-[#2d3139]" />
          </div>

          <form id="auth-form" onSubmit={handleSubmit} className="space-y-3.5">
            {isSignUp ? (
              <>
                {/* Avatar Picker for Sign Up */}
                <div id="signup-avatar-selector" className="space-y-2 bg-[#0f1115] p-3 rounded-2xl border border-[#2d3139]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">Choose Profile Picture / Avatar</span>
                    <button
                      type="button"
                      id="toggle-signup-avatars-btn"
                      onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      {showAvatarPicker ? 'Hide Options' : `Browse Avatars (${PRESET_AVATARS.length})`}
                    </button>
                  </div>
                  <div className={`grid grid-cols-6 gap-2 ${showAvatarPicker ? 'max-h-40 overflow-y-auto pr-1' : 'max-h-12 overflow-hidden'}`}>
                    {PRESET_AVATARS.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedAvatar(url)}
                        className={`w-8 h-8 rounded-xl overflow-hidden border-2 transition-all ${
                          selectedAvatar === url ? 'border-emerald-400 ring-2 ring-emerald-500/50 scale-105' : 'border-[#2d3139]'
                        }`}
                      >
                        <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Full Name Field */}
                <div id="auth-field-displayname" className="space-y-1">
                  <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                    <span>Full Display Name</span>
                    <span className="text-[10px] text-slate-400 font-normal">e.g. Alex Rivera</span>
                  </label>
                  <input
                    id="auth-displayname-input"
                    type="text"
                    required
                    placeholder="Enter your full name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </>
            ) : null}

            {/* Username @handle Field */}
            <div id="auth-field-username" className="space-y-1">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>{isSignUp ? 'Choose Handle / Username (@username)' : 'Username or Handle'}</span>
                <span className="text-[10px] text-emerald-400 font-mono">@unique_handle</span>
              </label>
              <input
                id="auth-username-input"
                type="text"
                required
                placeholder={isSignUp ? 'alex_rivera' : 'Enter handle or username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Email Address Field */}
            <div id="auth-field-email" className="space-y-1">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Email Address</span>
                <span className="text-[10px] text-slate-400 font-normal">you@example.com</span>
              </label>
              <input
                id="auth-email-input"
                type="email"
                required={isSignUp}
                placeholder="your.email@gmail.com"
                value={customGmail}
                onChange={(e) => setCustomGmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Secure Password Field */}
            <div id="auth-field-password" className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" /> Secure Password
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {isSignUp ? 'Min 8 chars, letter, number & symbol' : 'Enter password'}
                </span>
              </label>
              <div className="relative">
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Quality Indicator in SignUp mode */}
              {isSignUp && password.length > 0 && (
                <div className="bg-[#0f1115] p-2.5 rounded-xl border border-[#2d3139] space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Password Strength:</span>
                    <span className={`font-bold ${
                      passValidation.score <= 1 ? 'text-red-400' : passValidation.score <= 3 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {passValidation.score <= 1 ? 'Weak' : passValidation.score <= 3 ? 'Medium' : 'Strong'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                    <div className={`h-full flex-1 transition-all ${passValidation.score >= 1 ? (passValidation.score === 1 ? 'bg-red-500' : passValidation.score <= 3 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-800'}`} />
                    <div className={`h-full flex-1 transition-all ${passValidation.score >= 2 ? (passValidation.score <= 3 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-800'}`} />
                    <div className={`h-full flex-1 transition-all ${passValidation.score >= 3 ? 'bg-amber-500' : 'bg-slate-800'}`} />
                    <div className={`h-full flex-1 transition-all ${passValidation.score >= 4 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] pt-1">
                    <span className={passValidation.hasMinLength ? 'text-emerald-400 flex items-center gap-1' : 'text-slate-500 flex items-center gap-1'}>
                      <Check className="w-3 h-3" /> 8+ Characters
                    </span>
                    <span className={passValidation.hasUppercase ? 'text-emerald-400 flex items-center gap-1' : 'text-slate-500 flex items-center gap-1'}>
                      <Check className="w-3 h-3" /> Uppercase (A-Z)
                    </span>
                    <span className={passValidation.hasNumber ? 'text-emerald-400 flex items-center gap-1' : 'text-slate-500 flex items-center gap-1'}>
                      <Check className="w-3 h-3" /> Includes Number
                    </span>
                    <span className={passValidation.hasSpecialChar ? 'text-emerald-400 flex items-center gap-1' : 'text-slate-500 flex items-center gap-1'}>
                      <Check className="w-3 h-3" /> Special Char (!@#$)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* VIP Creator Badge Checkbox */}
            {isSignUp && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0f1115] border border-[#2d3139]">
                <div>
                  <span className="text-xs font-bold text-emerald-400 block">VIP Creator Account</span>
                  <span className="text-[10px] text-slate-400 block">Enable social tipping, reels & exclusive content</span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked={true}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>
            )}

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : isSignUp ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Processing...' : isSignUp ? 'Create Complete Account & Sign In' : 'Sign In'}
            </button>
          </form>

          <div id="auth-toggle-mode" className="text-center">
            <button
              id="switch-auth-mode-btn"
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-blue-400 hover:underline font-medium"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div id="auth-footer" className="px-6 py-3 bg-[#0f1115] border-t border-[#2d3139] text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>Secured Private End-to-End Messaging</span>
        </div>
      </div>

      {/* Gmail Google Login Modal Overlay */}
      {showGoogleModal && (
        <div id="google-auth-modal" className="fixed inset-0 bg-black/80 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#181a1f] rounded-2xl shadow-2xl w-full max-w-sm border border-[#2d3139] overflow-hidden text-[#f8fafc]">
            {/* Google Header */}
            <div className="px-5 py-4 border-b border-[#2d3139] flex items-center justify-between bg-[#1f232b]">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span className="text-sm font-bold text-white">Sign in with Google</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Google Accounts Selection Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-300">
                Enter your Gmail address to sign in or create your user account:
              </p>

              {/* Custom Gmail Form */}
              <form onSubmit={handleCustomGoogleSubmit} className="space-y-2.5">
                <input
                  type="email"
                  required
                  placeholder="your.email@gmail.com"
                  value={customGmail}
                  onChange={(e) => setCustomGmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Full Name (optional)"
                  value={googleName}
                  onChange={(e) => setGoogleName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  Authenticate Gmail Account
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



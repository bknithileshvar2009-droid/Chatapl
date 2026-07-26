import React, { useState } from 'react';
import { ShoppingBag, Ticket, CreditCard, Sparkles, X, Check, ExternalLink } from 'lucide-react';

interface Props {
  appType: 'tickets' | 'food' | 'payment';
  onClose: () => void;
  onSendToChat?: (payload: string) => void;
}

export const MiniAppContainer: React.FC<Props> = ({ appType, onClose, onSendToChat }) => {
  const [completed, setCompleted] = useState(false);
  const [amount, setAmount] = useState('25.00');

  const handleAction = () => {
    setCompleted(true);
    setTimeout(() => {
      if (onSendToChat) {
        if (appType === 'tickets') {
          onSendToChat('🎟️ VIP Concert Ticket Purchased & Verified ($75.00)');
        } else if (appType === 'food') {
          onSendToChat('🍔 Artisan Burgers order placed — ETA 20 mins');
        } else {
          onSendToChat(`💳 Instant Pay transfer completed ($${amount})`);
        }
      }
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm overflow-hidden text-white shadow-2xl p-5 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        {completed ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center mx-auto text-slate-950 animate-bounce">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Transaction Confirmed!</h3>
            <p className="text-xs text-slate-400">Receipt attached to chat thread.</p>
          </div>
        ) : appType === 'tickets' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <Ticket className="w-4 h-4" /> Apex Mini-App • Event Pass
            </div>
            <h3 className="text-base font-bold text-white">Apex Tech World 2026 Pass</h3>
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 text-xs space-y-1">
              <p className="font-semibold text-slate-200">VIP Access + Creator Keynote</p>
              <p className="text-slate-400">Date: Sat, Sep 12 • San Francisco</p>
              <p className="text-emerald-400 font-bold text-sm mt-2">$75.00 USD</p>
            </div>
            <button
              onClick={handleAction}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition"
            >
              Buy Ticket & Share in Chat
            </button>
          </div>
        ) : appType === 'food' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <ShoppingBag className="w-4 h-4" /> Apex Express • Food Delivery
            </div>
            <h3 className="text-base font-bold text-white">Gourmet Burger Combo</h3>
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 text-xs space-y-1">
              <p className="font-semibold text-slate-200">Double Truffle Burger + Fries + Shake</p>
              <p className="text-slate-400">Delivery Time: ~18-22 mins</p>
              <p className="text-amber-400 font-bold text-sm mt-2">$22.50 USD</p>
            </div>
            <button
              onClick={handleAction}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition"
            >
              Order & Split Bill in Group
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
              <CreditCard className="w-4 h-4" /> Apex Pay • P2P Stripe Transfer
            </div>
            <h3 className="text-base font-bold text-white">Send Direct Money</h3>
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 space-y-2">
              <label className="text-[11px] text-slate-400 block font-semibold">Enter Amount ($)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-lg font-extrabold text-emerald-400"
              />
            </div>
            <button
              onClick={handleAction}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition"
            >
              Send ${amount} Instantly
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

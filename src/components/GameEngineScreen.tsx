import React from 'react';
import { ArrowLeft, Bird, Car, Puzzle, User, HelpCircle } from 'lucide-react';

interface GameEngineScreenProps {
  onBack: () => void;
  onSelect: (template: string) => void;
}

const templates = [
  { id: 'flappy', name: 'Flappy Bird', icon: Bird, color: 'bg-yellow-500', desc: 'Tap to jump, avoid pipes' },
  { id: 'runner', name: 'Car Runner', icon: Car, color: 'bg-red-500', desc: 'Avoid traffic, collect coins' },
  { id: 'puzzle', name: 'Puzzle Match', icon: Puzzle, color: 'bg-green-500', desc: 'Match 3 puzzle game' },
  { id: 'platform', name: 'Platform Jump', icon: User, color: 'bg-blue-500', desc: 'Jump and collect' },
  { id: 'quiz', name: 'Quiz Game', icon: HelpCircle, color: 'bg-purple-500', desc: 'Make your own quiz' },
];

export default function GameEngineScreen({ onBack, onSelect }: GameEngineScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0f0f0f] p-6 overflow-y-auto pb-20">
      <button onClick={onBack} className="text-white mb-6">
        <ArrowLeft className="w-6 h-6" />
      </button>
      <h1 className="text-2xl font-black text-white mb-2">KING Game Studio</h1>
      <p className="text-zinc-400 mb-8">Select a template to create your game</p>
      
      <div className="grid grid-cols-2 gap-4">
        {templates.map((t) => (
          <button 
            key={t.id} 
            onClick={() => onSelect(t.id)}
            className={`${t.color} p-4 rounded-2xl flex flex-col items-center text-center text-black font-bold shadow-lg`}
          >
            <t.icon className="w-10 h-10 mb-2" />
            <span className="text-sm">{t.name}</span>
            <span className="text-[10px] opacity-80 mt-1">{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

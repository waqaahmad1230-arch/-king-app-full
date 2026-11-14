import React from 'react';
import { Gamepad2, Upload, Settings, BookOpen, X, Bird, Car, Puzzle, User, HelpCircle } from 'lucide-react';

interface GameCreatorMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOption: (option: string) => void;
  onSelectTemplate: (templateId: 'flappy' | 'runner' | 'puzzle' | 'platform' | 'quiz') => void;
}

const templates = [
  { id: 'flappy', name: 'Flappy Bird', icon: Bird, color: 'bg-yellow-500' },
  { id: 'runner', name: 'Car Runner', icon: Car, color: 'bg-red-500' },
  { id: 'puzzle', name: 'Puzzle Match', icon: Puzzle, color: 'bg-green-500' },
  { id: 'platform', name: 'Platform Jump', icon: User, color: 'bg-blue-500' },
  { id: 'quiz', name: 'Quiz Game', icon: HelpCircle, color: 'bg-purple-500' },
];

export default function GameCreatorMenu({ isOpen, onClose, onSelectOption, onSelectTemplate }: GameCreatorMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div 
        className="w-full max-w-md bg-zinc-900 rounded-t-3xl p-6 border-t border-zinc-700 animate-in slide-in-from-bottom max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-white">Game Creator</h2>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider">Start New Game</h3>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <button 
                  key={t.id} 
                  onClick={() => onSelectTemplate(t.id as any)}
                  className={`${t.color} p-3 rounded-xl flex flex-col items-center text-center text-black font-bold hover:scale-105 transition-transform`}
                >
                  <t.icon className="w-6 h-6 mb-1" />
                  <span className="text-xs">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider">Manage</h3>
            <div className="space-y-2">
              <button onClick={() => onSelectOption('my_games')} className="w-full flex items-center gap-4 p-4 bg-zinc-800 rounded-2xl text-white font-bold hover:bg-zinc-700">
                <Gamepad2 className="w-6 h-6 text-green-400" />
                My Games
              </button>
              <button onClick={() => onSelectOption('upload')} className="w-full flex items-center gap-4 p-4 bg-zinc-800 rounded-2xl text-white font-bold hover:bg-zinc-700">
                <Upload className="w-6 h-6 text-blue-400" />
                Upload System
              </button>
              <button onClick={() => onSelectOption('rules')} className="w-full flex items-center gap-4 p-4 bg-zinc-800 rounded-2xl text-white font-bold hover:bg-zinc-700">
                <BookOpen className="w-6 h-6 text-amber-400" />
                Rules
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

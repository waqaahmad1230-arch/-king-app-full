import React, { useState, useRef } from 'react';
import { ArrowLeft, Play, Save, Upload, Smile, Palette, Settings, Gamepad2 } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { generateUniqueFlappyHtml } from '../utils/gameGenerators';
import { GamePlayer } from './GamePlayer';

interface GameEditorScreenProps {
  templateId: string;
  onBack: () => void;
  onPublish?: () => void;
}

const EMOJIS = ['🐦', '🦖', '🚀', '🏎️', '🤡', '👽', '👻', '🤖', '🐶', '🐱', '🐹', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'];
const birdEmojis = ["🐦","🦅","🦉","🦆","🐧","🦜","🕊️","🦢","🐔","🐥","🐤","🐣","🦩","🦚","🦃","🦤"];
const premiumBirds = [
  { id:'yellow', name:'Classic Yellow', color:'#FFEB3B', img:'🐤' },
  { id:'blue', name:'Sky Blue', color:'#2196F3', img:'🐦' },
  { id:'red', name:'Fire Red', color:'#F44336', img:'🦜' },
  { id:'night', name:'Midnight', color:'#111827', img:'🦅' },
  { id:'golden', name:'Golden King', color:'#FFD700', img:'🦚' },
  { id:'ice', name:'Ice White', color:'#E0F2FE', img:'🕊️' }
];

export default function GameEditorScreen({ templateId, onBack }: GameEditorScreenProps) {
  const [config, setConfig] = useState({
    title: '',
    gameOverText: 'Game Over!',
    playerEmoji: '🐦',
    playerBase64: '',
    bgBase64: '',
    bgColor: '#87CEEB',
    obstacleType: 'pipes',
    gapSize: 100,
    levels: [
      { speed: 2, count: 3 },
      { speed: 3, count: 4 },
      { speed: 4, count: 5 }
    ]
  });

  const [speed, setSpeed] = useState('5');
  const [jump, setJump] = useState('5');
  const [gap, setGap] = useState('100');
  const [difficulty, setDifficulty] = useState('Medium');
  const [control, setControl] = useState('Tap');
  const [bgColor, setBgColor] = useState(config.bgColor);
  const [map, setMap] = useState('sky');
  const [pipeStyle, setPipeStyle] = useState('green');
  const [building, setBuilding] = useState('city');
  const [decoration, setDecoration] = useState('both');

  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File, maxWidth: number, quality: number, maxSizeKB: number): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(maxWidth / img.width, 1);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
      };
    });
  };

  const handlePublish = async () => {
    if (!config.title) return alert('Title required');
    setLoading(true);
    try {
      await addDoc(collection(db, 'user_uploaded_games'), {
        ...config,
        title: config.title,
        gameOverText: config.gameOverText,
        template: templateId,
        speed,
        jump,
        gap,
        difficulty,
        control,
        bgColor,
        map,
        pipeStyle,
        building,
        decoration,
        userId: auth.currentUser?.uid,
        userEmail: auth.currentUser?.email,
        status: 'pending',
        createdAt: serverTimestamp(),
        isEngineGame: true,
        isPhase2: true,
        plays: 0
      });
      alert('Game Created! Submitted for approval.');
      onBack();
    } catch (e) {
      console.error(e);
      alert('Failed to publish');
    } finally {
      setLoading(false);
    }
  };

  const getMapBg = () => {
    if(map==='night') return '#0F172A';
    if(map==='city') return '#334155';
    if(map==='jungle') return '#14532D';
    if(map==='desert') return '#FEF3C7';
    return bgColor;
  }

  const getPipeColor = () => {
    if(pipeStyle==='steel') return '#64748B';
    if(pipeStyle==='wood') return '#A16207';
    if(pipeStyle==='neon') return '#A855F7';
    return '#22C55E';
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0f0f0f] text-white pb-20 overflow-y-auto">
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes flap { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(0.9)} }
      `}</style>
      <div className="p-4 flex items-center border-b border-zinc-800 sticky top-0 bg-[#0f0f0f]/90 backdrop-blur">
        <button onClick={onBack} className="mr-4"><ArrowLeft /></button>
        <h1 className="text-lg font-black">Editor: {templateId}</h1>
        <button onClick={() => setShowPreview(true)} className="ml-auto bg-blue-600 p-2 rounded-full"><Play size={20}/></button>
      </div>
      
      <div className="p-4 space-y-6">
         <div style={{background:'#111', border:'1px solid #2A2A2A', borderRadius:'14px', padding:'12px', marginBottom:'12px'}}>
           <div style={{color:'#fff', fontSize:'12px', fontWeight:'600', marginBottom:'8px'}}>⚙️ Basic Settings</div>
           
           <input 
             type="text" 
             value={config.title} 
             onChange={(e)=>setConfig({...config, title: e.target.value})}
             placeholder="Game Title - e.g. My Flappy"
             style={{width:'100%', background:'#1E1E1E', border:'1px solid #333', borderRadius:'8px', padding:'10px', color:'#fff', fontSize:'13px', marginBottom:'8px', outline:'none'}}
           />
           
           <input 
             type="text" 
             value={config.gameOverText} 
             onChange={(e)=>setConfig({...config, gameOverText: e.target.value})}
             placeholder="Game Over Text"
             style={{width:'100%', background:'#1E1E1E', border:'1px solid #333', borderRadius:'8px', padding:'10px', color:'#fff', fontSize:'13px', outline:'none'}}
           />
         </div>

        <section className="bg-zinc-900 p-4 rounded-xl">
           <h2 className="font-bold mb-3 flex items-center gap-2"><Smile size={16}/> {templateId === 'flappy' ? 'Choose Bird' : 'Player'}</h2>
           {templateId === 'flappy' ? (
             <div style={{
                 background:'#111', 
                 border:'1px solid #2A2A2A', 
                 borderRadius:'14px', 
                 padding:'12px', 
                 marginBottom:'12px'
               }}>
                 <div style={{color:'#fff', fontSize:'12px', fontWeight:'600', marginBottom:'8px', display:'flex', alignItems:'center', gap:'6px'}}>
                   <span>🐦</span> Choose Bird
                 </div>

                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px'}}>
                   {premiumBirds.map(bird => (
                     <div key={bird.id} onClick={()=>setConfig({...config, playerEmoji: bird.img, playerBase64: ''})}
                       style={{
                         background: `linear-gradient(135deg, ${bird.color}40, #000)`,
                         border: config.playerEmoji===bird.img ? '2px solid #FFD700' : '1px solid #333',
                         borderRadius:'12px', padding:'8px', textAlign:'center', cursor:'pointer', height: '62px',
                         boxShadow: config.playerEmoji===bird.img ? '0 0 10px gold' : 'none',
                         animation: config.playerEmoji===bird.img ? 'flap 0.3s infinite' : 'none',
                         transition:'all 0.2s'
                       }}>
                       <div style={{fontSize:'20px', animation:'float 1s ease-in-out infinite'}}>{bird.img}</div>
                       <div style={{fontSize:'9px', color:'#fff', marginTop:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{bird.name}</div>
                     </div>
                   ))}
                 </div>

                 <div style={{marginTop:'8px'}}>
                   <button onClick={() => fileInputRef.current?.click()} style={{width:'100%', background:'#222', color:'#aaa', border:'1px dashed #444', borderRadius:'8px', padding:'8px', fontSize:'11px', cursor:'pointer'}}>↥ Upload Photo</button>
                 </div>
               </div>
           ) : (
             <div className="flex flex-wrap gap-2 mb-3">
               {EMOJIS.map(e => (
                 <button key={e} onClick={() => setConfig({...config, playerEmoji: e, playerBase64: ''})} className={`p-2 rounded-lg ${config.playerEmoji === e ? 'bg-blue-600' : 'bg-black'}`}>{e}</button>
               ))}
             </div>
           )}
           <input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
             if (e.target.files?.[0]) {
               const b64 = await compressImage(e.target.files[0], 128, 0.4, 15);
               setConfig({...config, playerBase64: b64});
             }
           }} />
        </section>

        <section className="bg-zinc-900 p-4 rounded-xl">
           <h2 className="font-bold mb-3 flex items-center gap-2"><Palette size={16}/> Background</h2>
           <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
             {["#87CEEB","#0F172A","#FF6B6B","#22C55E","#FDE68A"].map(c=>(
               <div key={c} onClick={()=>{setConfig({...config, bgColor: c}); setBgColor(c);}} style={{width:'48px',height:'48px',borderRadius:'50%',background:c, border: bgColor===c ? '3px solid gold' : '1px solid #555', cursor:'pointer'}} />
             ))}
           </div>
        </section>

        <div style={{background:'#111', border:'1px solid #2A2A2A', borderRadius:'14px', padding:'12px', marginBottom:'12px'}}>
          <div style={{color:'#fff', fontSize:'12px', fontWeight:'600', marginBottom:'10px'}}>🎮 Game Settings</div>
          
          <div style={{marginBottom:'10px'}}>
            <label style={{color:'#aaa', fontSize:'10px'}}>Speed: {speed}</label>
            <input type="range" min="1" max="10" value={speed} onChange={e=>setSpeed(e.target.value)} style={{width:'100%'}} />
          </div>
          
          <div style={{marginBottom:'10px'}}>
            <label style={{color:'#aaa', fontSize:'10px'}}>Jump Power: {jump}</label>
            <input type="range" min="1" max="10" value={jump} onChange={e=>setJump(e.target.value)} style={{width:'100%'}} />
          </div>

          <div style={{marginBottom:'10px'}}>
            <label style={{color:'#aaa', fontSize:'10px'}}>Pipe Gap: {gap}</label>
            <input type="range" min="50" max="200" value={gap} onChange={e=>setGap(e.target.value)} style={{width:'100%'}} />
          </div>

          <div style={{display:'flex', gap:'8px'}}>
            <select value={difficulty} onChange={e=>setDifficulty(e.target.value)} style={{flex:1, background:'#1E1E1E', color:'#fff', padding:'8px', borderRadius:'8px', border:'1px solid #333'}}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
            <select value={control} onChange={e=>setControl(e.target.value)} style={{flex:1, background:'#1E1E1E', color:'#fff', padding:'8px', borderRadius:'8px', border:'1px solid #333'}}>
              <option>Tap</option><option>Swipe</option>
            </select>
          </div>
        </div>

        <div style={{background:'#111', border:'1px solid #2A2A2A', borderRadius:'14px', padding:'12px', marginBottom:'12px'}}>
          <div style={{color:'#fff', fontSize:'12px', fontWeight:'600', marginBottom:'10px'}}>🌍 World & Pipes</div>

          <div style={{marginBottom:'10px'}}>
            <div style={{color:'#aaa', fontSize:'10px', marginBottom:'6px'}}>Map Theme</div>
            <div style={{display:'flex', gap:'6px', flexWrap:'wrap'}}>
              {[
                {id:'sky', name:'☀️ Day Sky'},
                {id:'night', name:'🌙 Night'},
                {id:'city', name:'🏙️ City'},
                {id:'jungle', name:'🌲 Jungle'},
                {id:'desert', name:'🏜️ Desert'}
              ].map(m=>(
                <div key={m.id} onClick={()=>setMap(m.id)} style={{padding:'6px 10px', borderRadius:'20px', background: map===m.id ? '#FFD700' : '#1E1E1E', color: map===m.id ? '#000' : '#fff', fontSize:'10px', cursor:'pointer', border:'1px solid #333'}}>{m.name}</div>
              ))}
            </div>
          </div>

          <div style={{marginBottom:'10px'}}>
            <div style={{color:'#aaa', fontSize:'10px', marginBottom:'6px'}}>Pipe Style</div>
            <div style={{display:'flex', gap:'6px'}}>
              {[
                {id:'green', c:'#22C55E', name:'Classic'},
                {id:'steel', c:'#64748B', name:'Steel'},
                {id:'wood', c:'#A16207', name:'Wood'},
                {id:'neon', c:'#A855F7', name:'Neon'}
              ].map(p=>(
                <div key={p.id} onClick={()=>setPipeStyle(p.id)} style={{width:'44px', height:'44px', borderRadius:'8px', background:p.c, border: pipeStyle===p.id ? '2px solid gold' : '1px solid #333', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'8px', color:'#fff'}}>{p.name}</div>
              ))}
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'}}>
            <div>
              <div style={{color:'#aaa', fontSize:'10px'}}>Buildings</div>
              <select value={building} onChange={e=>setBuilding(e.target.value)} style={{width:'100%', background:'#1E1E1E', color:'#fff', padding:'8px', borderRadius:'8px', border:'1px solid #333', fontSize:'11px'}}>
                <option value="city">🏢 City</option><option value="none">No Building</option><option value="small">Small Houses</option>
              </select>
            </div>
            <div>
              <div style={{color:'#aaa', fontSize:'10px'}}>Trees / Clouds</div>
              <select value={decoration} onChange={e=>setDecoration(e.target.value)} style={{width:'100%', background:'#1E1E1E', color:'#fff', padding:'8px', borderRadius:'8px', border:'1px solid #333', fontSize:'11px'}}>
                <option value="both">🌲+☁️ Both</option><option value="trees">Only Trees</option><option value="clouds">Only Clouds</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{background:'#000', border:'1px solid #333', borderRadius:'14px', padding:'12px', marginBottom:'12px'}}>
          <div style={{color:'#fff', fontSize:'12px', marginBottom:'8px'}}>👁️ Live Preview</div>
          <div style={{width:'100%', height:'220px', background:getMapBg(), borderRadius:'10px', position:'relative', overflow:'hidden'}}>
            {/* Clouds */}
            {decoration!=='trees' && <div style={{position:'absolute', top:'20px', left:'20px', fontSize:'20px'}}>☁️ ☁️</div>}
            
            {/* Buildings */}
            {building!=='none' && <div style={{position:'absolute', bottom:'30px', left:'0', right:'0', display:'flex', justifyContent:'space-around', opacity:0.6, fontSize:'24px'}}>{building==='city' ? '🏢🏙️🏢🏙️' : '🏠🏠🏠'}</div>}
            
            {/* Trees */}
            {decoration!=='clouds' && <div style={{position:'absolute', bottom:'30px', left:'10px', fontSize:'18px'}}>🌲 🌲</div>}

            {/* Pipes */}
            <div style={{position:'absolute', top:'0', right:'40px', width:'40px', height:'70px', background:getPipeColor(), border:'2px solid #000'}}></div>
            <div style={{position:'absolute', bottom:'30px', right:'40px', width:'40px', height:'70px', background:getPipeColor(), border:'2px solid #000'}}></div>

            {/* Bird - jump animation based on jump state */}
            <div style={{position:'absolute', left:'50%', top:`${60 - parseInt(jump)*3}px`, transform:'translateX(-50%)', fontSize:'36px', animation:`float ${1.2 - parseInt(speed)*0.07}s ease-in-out infinite`, transition:'top 0.3s'}}>{config.playerEmoji || '🐦'}</div>

            {/* Ground */}
            <div style={{position:'absolute', bottom:'0', width:'100%', height:'30px', background:'#A16207'}}></div>

            <div style={{position:'absolute', bottom:'35px', left:'50%', transform:'translateX(-50%)', color:'#fff', fontSize:'9px', background:'rgba(0,0,0,0.5)', padding:'2px 6px', borderRadius:'10px'}}>Speed:{speed} Gap:{gap} {map} {pipeStyle}</div>
          </div>
        </div>
        
        <button onClick={handlePublish} disabled={loading} className="w-full py-4 bg-green-600 rounded-2xl font-bold">{loading ? 'Publishing...' : 'Publish Game'}</button>
      </div>

      {showPreview && (
        <GamePlayer 
          srcDoc={generateUniqueFlappyHtml({...config, bgColor, speed, jump, gap, difficulty, control, map, pipeStyle, building, decoration})} 
          gameTitle={config.title || 'Preview'} 
          onClose={() => setShowPreview(false)} 
        />
      )}
    </div>
  );
}

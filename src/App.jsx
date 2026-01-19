import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  runTransaction,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Trophy, 
  History, 
  Users, 
  PlusCircle, 
  Play, 
  Activity, 
  Target, 
  Edit2, 
  Save, 
  X,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2
} from 'lucide-react';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDZq-mOkBiek1y4FkPXysEQFGetv3sgw4I",
  authDomain: "dartslab-cf7c8.firebaseapp.com",
  projectId: "dartslab-cf7c8",
  storageBucket: "dartslab-cf7c8.firebasestorage.app",
  messagingSenderId: "1014701335663",
  appId: "1:1014701335663:web:df2f703420da4ef7f0199a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Constantes & Utilitaires ---
const K_FACTOR = 32;

const calculateElo = (ratingA, ratingB, actualScoreA) => {
  // Formule logistique standard (Elo, 1978)
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(K_FACTOR * (actualScoreA - expectedA));
};

// --- Composants UI ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor_not_allowed";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30",
    secondary: "bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/30",
    ghost: "text-slate-400 hover:text-white hover:bg-slate-800"
  };
  
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div className={`bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-xl p-6 shadow-xl ${className}`}>
    {children}
  </div>
);

const Input = ({ ...props }) => (
  <input 
    {...props} 
    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-slate-500"
  />
);

// --- Application Principale ---
// --- Main Application ---

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, game, players, history
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState(new Set());

  // États pour le jeu
  const [gameState, setGameState] = useState({
    active: false,
    players: [], // [{ pid, name, score, elo }]
    turnIndex: 0,
    roundScore: '',
    moves: []
  });

  // États pour formulaires
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerId, setNewPlayerId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  // 1. Authentification
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Chargement des données (Firestore)
  useEffect(() => {
    if (!user) return;

    // Collection "players"
    const qPlayers = query(collection(db, 'artifacts', appId, 'public', 'data', 'players'));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlayers(pList);
      setLoading(false);
    }, (err) => console.error("Err players:", err));

    // Collection "history" (limité aux derniers matchs pour l'affichage, mais on prend tout ici pour simplifier)
    const qHistory = query(collection(db, 'artifacts', appId, 'public', 'data', 'history'), orderBy('date', 'desc'));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const hList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(hList);
    }, (err) => console.error("Err history:", err));

    return () => {
      unsubPlayers();
      unsubHistory();
    };
  }, [user]);

  // --- Logique Métier ---

  const handleAddPlayer = async () => {
    if (!newPlayerId || !newPlayerName || newPlayerId.length !== 3) {
      alert("L'ID doit faire 3 caractères."); 
      return;
    }
    const pid = newPlayerId.toUpperCase();
    if (players.some(p => p.pid === pid)) {
      alert("Cet ID existe déjà.");
      return;
    }

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', pid), {
        pid: pid,
        name: newPlayerName,
        elo: 1200,
        matches: 0,
        wins: 0,
        createdAt: serverTimestamp()
      });
      setNewPlayerName('');
      setNewPlayerId('');
      alert("Joueur ajouté !");
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateName = async (pid) => {
    if (!editName.trim()) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', pid), {
        name: editName
      }, { merge: true });
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const startGame = (selectedPlayerIds) => {
    const gamePlayers = selectedPlayerIds.map(pid => {
      const p = players.find(pl => pl.pid === pid);
      return { pid: p.pid, name: p.name, score: 501, elo: p.elo };
    });

    setGameState({
      active: true,
      players: gamePlayers,
      turnIndex: 0,
      roundScore: '',
      moves: []
    });
    setView('game');
  };

  const submitScore = async () => {
    const points = parseInt(gameState.roundScore);
    if (isNaN(points) || points < 0 || points > 180) {
      alert("Score invalide (0-180)");
      return;
    }

    const currentPlayerIndex = gameState.turnIndex;
    const currentPlayer = gameState.players[currentPlayerIndex];
    const currentScore = currentPlayer.score;
    const newScore = currentScore - points;
    
    let finalScore = newScore;
    let winner = null;
    let isBust = false;

    // Logique 501
    if (newScore === 0) {
      winner = currentPlayer.pid;
    } else if (newScore < 0 || newScore === 1) {
      // Bust
      isBust = true;
      // Le score ne change pas, on passe juste le tour
      finalScore = currentScore;
    } else {
      // Score valide, rien de spécial
    }

    // Mise à jour des joueurs
    const newPlayers = [...gameState.players];
    newPlayers[currentPlayerIndex] = { ...currentPlayer, score: finalScore };

    // Enregistrement du coup
    const newMove = {
      playerId: currentPlayer.pid,
      points: points,
      remaining: finalScore,
      isBust: isBust,
      timestamp: Date.now()
    };
    const updatedMoves = [...(gameState.moves || []), newMove];

    if (winner) {
      if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      const loserIds = gameState.players.filter(p => p.pid !== winner).map(p => p.pid);
      await recordGame(winner, loserIds, updatedMoves);
      setGameState({ ...gameState, active: false });
      setView('dashboard');
    } else {
      setGameState({
        ...gameState,
        players: newPlayers,
        turnIndex: (currentPlayerIndex + 1) % gameState.players.length,
        roundScore: '',
        moves: updatedMoves
      });
    }
  };

  const recordGame = async (winnerId, loserIds, moves = []) => {
    const winner = players.find(p => p.pid === winnerId);
    const losers = loserIds.map(id => players.find(p => p.pid === id));
    
    if (!winner || losers.length === 0) return;

    // Calcul Elo Multijoueur (Winner takes all vs each loser)
    let totalWinnerChange = 0;
    const loserUpdates = [];

    losers.forEach(loser => {
      // Le gagnant joue contre ce perdant
      const change = calculateElo(winner.elo, loser.elo, 1);
      totalWinnerChange += change;

      // Le perdant joue contre le gagnant
      const loserChange = calculateElo(loser.elo, winner.elo, 0);
      loserUpdates.push({ 
        pid: loser.pid, 
        change: loserChange,
        matches: loser.matches + 1
      });
    });

    try {
      // Transaction pour cohérence
      await runTransaction(db, async (transaction) => {
        const winnerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', winnerId);
        const historyRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'history'));

        transaction.update(winnerRef, {
          elo: winner.elo + totalWinnerChange,
          matches: winner.matches + 1,
          wins: winner.wins + 1
        });

        loserUpdates.forEach(lUpdate => {
          const lRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', lUpdate.pid);
          transaction.update(lRef, {
            elo: (players.find(p => p.pid === lUpdate.pid).elo) + lUpdate.change,
            matches: lUpdate.matches
          });
        });

        // Compatibilité : si 1v1, on remplit loserId/loserName comme avant
        // Sinon on utilise un tableau 'losers'
        const is1v1 = losers.length === 1;
        
        transaction.set(historyRef, {
          winnerId,
          winnerName: winner.name,
          // Champs legacy pour compatibilité 1v1
          loserId: is1v1 ? losers[0].pid : null,
          loserName: is1v1 ? losers[0].name : `${losers.length} joueurs`,
          
          // Nouveaux champs
          losers: losers.map((l, idx) => ({
            pid: l.pid,
            name: l.name,
            eloChange: loserUpdates[idx].change
          })),
          eloChange: totalWinnerChange,
          date: serverTimestamp(),
          moves: moves
        });
      });
      alert(`Victoire de ${winner.name} ! (+${totalWinnerChange} Elo)`);
    } catch (e) {
      console.error("Transaction failed: ", e);
      alert("Erreur lors de l'enregistrement du match.");
    }
  };

  const toggleHistory = (id) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const undoLastMove = () => {
    if (!gameState.moves || gameState.moves.length === 0) return;

    const newMoves = [...gameState.moves];
    const lastMove = newMoves.pop();

    // Retrouver l'index du joueur qui a joué ce coup
    const playerIndex = gameState.players.findIndex(p => p.pid === lastMove.playerId);
    if (playerIndex === -1) return;

    const prevScore = lastMove.isBust ? lastMove.remaining : lastMove.remaining + lastMove.points;
    const newPlayers = [...gameState.players];
    newPlayers[playerIndex] = { ...newPlayers[playerIndex], score: prevScore };

    setGameState(prev => ({
      ...prev,
      players: newPlayers,
      turnIndex: playerIndex, // On redonne la main à celui qui a joué
      moves: newMoves,
      roundScore: ''
    }));
  };

  // --- Vues ---

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      return b.matches - a.matches;
    });
  }, [players]);

  const PlayerItem = ({ p, rank }) => {
    // Recherche compatible avec l'ancien (loserId) et le nouveau (losers array) format
    const lastMatch = history.find(h => 
      h.winnerId === p.pid || 
      h.loserId === p.pid || 
      (h.losers && h.losers.some(l => l.pid === p.pid))
    );
    let TrendIcon = Minus;
    let trendColor = 'text-slate-600';

    if (lastMatch) {
      if (lastMatch.winnerId === p.pid) {
        TrendIcon = TrendingUp;
        trendColor = 'text-green-500';
      } else {
        TrendIcon = TrendingDown;
        trendColor = 'text-red-500';
      }
    }

    return (
      <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold ${rank === 1 ? 'bg-yellow-500 text-black' : rank === 2 ? 'bg-slate-300 text-black' : rank === 3 ? 'bg-amber-600 text-black' : 'bg-slate-600 text-white'}`}>
            {rank}
          </div>
          <div>
            {editingId === p.pid ? (
              <div className="flex gap-2">
                <input 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-slate-900 px-2 py-1 rounded text-sm text-white border border-blue-500 outline-none w-32"
                  autoFocus
                />
                <button onClick={() => handleUpdateName(p.pid)} className="text-green-400"><Save size={16}/></button>
                <button onClick={() => setEditingId(null)} className="text-red-400"><X size={16}/></button>
              </div>
            ) : (
              <div className="font-medium text-white flex items-center gap-2">
                {p.name} <span className="text-xs text-slate-400 font-mono">[{p.pid}]</span>
              </div>
            )}
            <div className="text-xs text-slate-400">
              {p.wins}V / {p.matches - p.wins}D ({p.matches > 0 ? Math.round((p.wins/p.matches)*100) : 0}%)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-bold text-blue-400 text-lg flex items-center justify-end gap-1">
              {p.elo}
              <TrendIcon size={14} className={trendColor} />
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">ELO</div>
          </div>
          {view === 'players' && !editingId && (
            <button onClick={() => { setEditingId(p.pid); setEditName(p.name); }} className="text-slate-500 hover:text-white">
              <Edit2 size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const GameView = () => {
    const currentPlayer = gameState.players[gameState.turnIndex];

    // NumPad simple pour mobile
    const addDigit = (d) => setGameState(prev => ({...prev, roundScore: prev.roundScore + d}));
    const clear = () => setGameState(prev => ({...prev, roundScore: ''}));

    useEffect(() => {
      const handleKeyDown = (e) => {
        if (e.key >= '0' && e.key <= '9') {
          addDigit(e.key);
        } else if (e.key === 'Backspace') {
          setGameState(prev => ({...prev, roundScore: prev.roundScore.slice(0, -1)}));
        } else if (e.key === 'Enter') {
          submitScore();
        } else if (e.key === 'Escape') {
          clear();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
      <div className="space-y-4 max-w-md mx-auto">
        {/* Grille des scores */}
        <div className="grid grid-cols-2 gap-3">
          {gameState.players.map((p, idx) => {
            const isTurn = idx === gameState.turnIndex;
            return (
              <div key={p.pid} className={`p-3 rounded-xl border transition-all ${isTurn ? 'bg-slate-800 border-blue-500 shadow-lg shadow-blue-900/20 scale-105 z-10' : 'bg-slate-900/50 border-slate-800 opacity-80'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`font-bold text-sm truncate ${isTurn ? 'text-white' : 'text-slate-400'}`}>{p.name}</span>
                  {isTurn && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
                </div>
                <div className={`text-3xl font-mono font-bold ${isTurn ? 'text-blue-400' : 'text-slate-500'}`}>
                  {p.score}
                </div>
              </div>
            );
          })}
        </div>

        {/* Historique des coups en cours */}
        <div className="bg-slate-900/50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1 text-sm border border-slate-800">
           <div className="text-xs text-slate-500 font-bold uppercase sticky top-0 bg-slate-900/90 backdrop-blur pb-1 mb-2 border-b border-slate-800">Historique de la partie</div>
           {gameState.moves && gameState.moves.slice().reverse().map((move, idx) => {
             const pName = players.find(p => p.pid === move.playerId)?.name || move.playerId;
             return (
               <div key={idx} className="flex justify-between text-slate-300">
                 <span className="text-slate-400">{pName}</span>
                 <span className="font-mono">
                   {move.points} {move.isBust && <span className="text-red-500 text-xs font-bold">BUST</span>} 
                   <span className="text-slate-600 mx-2">→</span> 
                   <span className={move.isBust ? 'text-slate-500' : 'text-white'}>{move.remaining}</span>
                 </span>
               </div>
             );
           })}
           {(!gameState.moves || gameState.moves.length === 0) && <div className="text-slate-600 text-center italic text-xs py-2">Aucun coup joué</div>}
        </div>

        <div className="text-center">
           <div className="text-slate-400 mb-2">Au tour de <span className="text-white font-bold">{currentPlayer?.name}</span></div>
           <div className="h-16 flex items-center justify-center bg-slate-900 rounded-lg border-2 border-slate-700 text-3xl font-mono tracking-widest text-white mb-4">
             {gameState.roundScore || <span className="text-slate-700">0</span>}
           </div>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => addDigit(n)} className="h-14 bg-slate-700 rounded-lg text-xl font-bold hover:bg-slate-600 active:bg-slate-500 transition-colors">
              {n}
            </button>
          ))}
          <button onClick={clear} className="h-14 bg-red-900/30 text-red-400 rounded-lg font-bold border border-red-900/50">C</button>
          <button onClick={() => addDigit(0)} className="h-14 bg-slate-700 rounded-lg text-xl font-bold hover:bg-slate-600">0</button>
          <button onClick={submitScore} className="h-14 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/50">OK</button>
        </div>

        <div className="flex gap-2 mt-4">
          <Button 
            variant="secondary" 
            className="flex-1" 
            onClick={undoLastMove}
            disabled={!gameState.moves || gameState.moves.length === 0}
          >
            <RotateCcw size={18} /> Annuler coup
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setView('dashboard')}>
            Quitter
          </Button>
        </div>
      </div>
    );
  };

  const PreGameView = () => {
    const [selectedIds, setSelectedIds] = useState([]);

    const togglePlayer = (pid) => {
      if (selectedIds.includes(pid)) {
        setSelectedIds(selectedIds.filter(id => id !== pid));
      } else {
        setSelectedIds([...selectedIds, pid]);
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white mb-6">Nouveau Match 501</h2>
        
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 max-h-96 overflow-y-auto">
          <div className="text-sm text-slate-400 mb-3 uppercase font-bold">Sélectionnez les joueurs ({selectedIds.length})</div>
          <div className="space-y-2">
            {sortedPlayers.map(p => {
              const isSelected = selectedIds.includes(p.pid);
              return (
                <div 
                  key={p.pid} 
                  onClick={() => togglePlayer(p.pid)}
                  className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-all ${isSelected ? 'bg-blue-900/30 border border-blue-500/50' : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'}`}
                >
                  <span className={isSelected ? 'text-white font-bold' : 'text-slate-300'}>{p.name}</span>
                  {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>}
                </div>
              );
            })}
          </div>
        </div>

        <Button 
          variant="success" 
          className="w-full py-4 text-lg" 
          disabled={selectedIds.length < 2}
          onClick={() => startGame(selectedIds)}
        >
          <Play size={20} fill="currentColor" /> Lancer le match
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setView('dashboard')}>Retour</Button>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-500 animate-pulse">Chargement de la base de données...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col">
        
        {/* Header */}
        <header className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2" onClick={() => setView('dashboard')}>
              <div className="bg-gradient-to-tr from-blue-600 to-purple-600 p-2 rounded-lg">
                <Target size={24} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white leading-tight">Darts Elo</h1>
                <p className="text-[10px] text-slate-400">Doctoral League</p>
              </div>
            </div>
            {view !== 'dashboard' && (
              <Button variant="ghost" onClick={() => setView('dashboard')} className="!p-2">
                <X size={20} />
              </Button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4">
          
          {view === 'game' && <GameView />}
          
          {view === 'pregame' && <PreGameView />}

          {view === 'players' && (
             <div className="space-y-6">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-bold text-white">Gestion Joueurs</h2>
                   <Button variant="ghost" onClick={() => setView('dashboard')}>Retour</Button>
                </div>
                
                <Card className="bg-slate-900/50">
                  <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Ajouter un joueur</h3>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="ID (3 lettres)" 
                      value={newPlayerId} 
                      onChange={e => setNewPlayerId(e.target.value.toUpperCase())} 
                      maxLength={3}
                      className="w-24 text-center font-mono uppercase"
                    />
                    <Input 
                      placeholder="Nom complet" 
                      value={newPlayerName} 
                      onChange={e => setNewPlayerName(e.target.value)} 
                    />
                  </div>
                  <Button onClick={handleAddPlayer} className="w-full mt-3">
                    <PlusCircle size={18} /> Ajouter
                  </Button>
                </Card>

                <div>
                  {sortedPlayers.map((p, i) => <PlayerItem key={p.pid} p={p} rank={i + 1} />)}
                </div>
             </div>
          )}

          {view === 'dashboard' && (
            <div className="space-y-8">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setView('pregame')}
                  className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl shadow-lg shadow-blue-900/20 text-left hover:scale-[1.02] transition-transform group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Target size={64} />
                  </div>
                  <Play size={32} className="text-blue-200 mb-3" fill="currentColor" />
                  <div className="font-bold text-white text-lg">Nouveau Match</div>
                  <div className="text-blue-200 text-sm">Règles 501</div>
                </button>

                <button 
                  onClick={() => setView('players')}
                  className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-left hover:bg-slate-750 hover:scale-[1.02] transition-transform"
                >
                  <Users size={32} className="text-purple-400 mb-3" />
                  <div className="font-bold text-white text-lg">Joueurs</div>
                  <div className="text-slate-400 text-sm">{players.length} inscrits</div>
                </button>
              </div>

              {/* Leaderboard Preview */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Trophy size={18} className="text-yellow-500" /> Classement Top 5
                  </h2>
                </div>
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-2">
                  {sortedPlayers.slice(0, 5).map((p, i) => (
                    <PlayerItem key={p.pid} p={p} rank={i+1} />
                  ))}
                  {players.length === 0 && <div className="text-center p-4 text-slate-500">Aucun joueur</div>}
                </div>
              </div>

              {/* Recent History */}
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <History size={18} className="text-slate-400" /> Derniers Matchs
                </h2>
                <div className="space-y-2">
                  {history.slice(0, 5).map((h) => (
                    <div key={h.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
                      <div 
                        className="p-3 flex items-center justify-between text-sm cursor-pointer hover:bg-slate-800 transition-colors"
                        onClick={() => toggleHistory(h.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-400">{h.winnerName}</span>
                          <span className="text-slate-500 text-xs">{h.losers && h.losers.length > 1 ? 'vs' : 'bat'}</span>
                          <span className="text-red-400">{h.loserName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="bg-slate-900 px-2 py-1 rounded text-xs text-slate-400 font-mono">
                            +{h.eloChange} Elo
                          </div>
                          {h.moves && (expandedHistory.has(h.id) ? <ChevronDown size={14} className="text-slate-500"/> : <ChevronRight size={14} className="text-slate-500"/>)}
                        </div>
                      </div>
                      
                      {/* Détails de l'historique */}
                      {expandedHistory.has(h.id) && h.moves && (
                        <div className="bg-slate-900/50 p-2 border-t border-slate-800 text-xs space-y-1 max-h-40 overflow-y-auto">
                          {h.moves.map((m, idx) => (
                            <div key={idx} className="flex justify-between px-2 text-slate-400">
                              <span>{m.playerId === h.winnerId ? h.winnerName : (h.losers?.find(l => l.pid === m.playerId)?.name || h.loserName)}</span>
                              <span className="font-mono">{m.points} {m.isBust && '(BUST)'} → {m.remaining}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {history.length === 0 && <div className="text-center p-4 text-slate-500 text-sm">Aucun historique</div>}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
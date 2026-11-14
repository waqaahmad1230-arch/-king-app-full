export interface Game {
  id: string;
  title: string;
  category: string;
  thumbnail: string;
  url: string;
  rating?: string | number;
  plays?: string;
  description?: string;
  status?: string;
  approved?: boolean;
}

// Baseline verified static games with authentic covers (Zero Unsplash or Picsum images)
export const games: Game[] = [
  {
    id: "static-race-01",
    title: "Moto X3M Bike Stunt",
    category: "Racing",
    thumbnail: "https://img.gamepix.com/games/moto-x3m/cover/moto-x3m.png",
    url: "https://play.gamepix.com/moto-x3m/embed",
    rating: "5.0",
    plays: "450K",
    description: "Perform extreme motorcycle stunts across perilous obstacle courses.",
    status: "approved",
    approved: true
  },
  {
    id: "static-race-02",
    title: "Drift Hunters 3D",
    category: "Racing",
    thumbnail: "https://img.gamepix.com/games/drift-hunters/cover/drift-hunters.png",
    url: "https://play.gamepix.com/drift-hunters/embed",
    rating: "4.9",
    plays: "380K",
    description: "Tune and drift legendary sports cars across 3D city tracks.",
    status: "approved",
    approved: true
  },
  {
    id: "static-race-03",
    title: "Highway Traffic Racer",
    category: "Racing",
    thumbnail: "https://img.gamepix.com/games/highway-traffic/cover/highway-traffic.png",
    url: "https://play.gamepix.com/highway-traffic/embed",
    rating: "4.8",
    plays: "290K",
    description: "Speed through dense highway traffic with multiple fast cars.",
    status: "approved",
    approved: true
  },
  {
    id: "static-race-04",
    title: "Moto X3M Pool Party",
    category: "Racing",
    thumbnail: "https://img.gamepix.com/games/moto-x3m-pool-party/cover/moto-x3m-pool-party.png",
    url: "https://play.gamepix.com/moto-x3m-pool-party/embed",
    rating: "4.9",
    plays: "310K",
    description: "Summer edition stunt bike levels packed with water slides and traps.",
    status: "approved",
    approved: true
  },
  {
    id: "static-act-01",
    title: "Stickman Hook Pro",
    category: "Action",
    thumbnail: "https://img.gamepix.com/games/stickman-hook/cover/stickman-hook.png",
    url: "https://play.gamepix.com/stickman-hook/embed",
    rating: "4.9",
    plays: "520K",
    description: "Swing through hundreds of challenging acrobatic levels.",
    status: "approved",
    approved: true
  },
  {
    id: "static-act-02",
    title: "Subway Surfers World",
    category: "Action",
    thumbnail: "https://img.gamepix.com/games/subway-surfers/cover/subway-surfers.png",
    url: "https://play.gamepix.com/subway-surfers/embed",
    rating: "5.0",
    plays: "890K",
    description: "Dash and dodge trains in the iconic endless runner.",
    status: "approved",
    approved: true
  },
  {
    id: "static-act-03",
    title: "Temple Run 2 Jungle",
    category: "Action",
    thumbnail: "https://img.gamepix.com/games/temple-run-2/cover/temple-run-2.png",
    url: "https://play.gamepix.com/temple-run-2/embed",
    rating: "4.9",
    plays: "610K",
    description: "Escape demonic monkeys through dangerous cliff-side temples.",
    status: "approved",
    approved: true
  },
  {
    id: "static-act-04",
    title: "Knife Hit Master",
    category: "Action",
    thumbnail: "https://img.gamepix.com/games/knife-hit/cover/knife-hit.png",
    url: "https://play.gamepix.com/knife-hit/embed",
    rating: "4.8",
    plays: "420K",
    description: "Throw knives into rotating logs and defeat intense bosses.",
    status: "approved",
    approved: true
  },
  {
    id: "static-act-05",
    title: "Fruit Ninja Blade",
    category: "Action",
    thumbnail: "https://img.gamepix.com/games/fruit-ninja/cover/fruit-ninja.png",
    url: "https://play.gamepix.com/fruit-ninja/embed",
    rating: "4.8",
    plays: "440K",
    description: "Slice succulent flying fruit with razor-sharp ninja katanas.",
    status: "approved",
    approved: true
  },
  {
    id: "static-puz-01",
    title: "2048 King Legend",
    category: "Puzzle",
    thumbnail: "https://img.gamepix.com/games/2048/cover/2048.png",
    url: "https://play.gamepix.com/2048/embed",
    rating: "4.9",
    plays: "580K",
    description: "Slide and merge identical numbered tiles to reach the 2048 block.",
    status: "approved",
    approved: true
  },
  {
    id: "static-puz-02",
    title: "Cut The Rope Classic",
    category: "Puzzle",
    thumbnail: "https://img.gamepix.com/games/cut-the-rope/cover/cut-the-rope.png",
    url: "https://play.gamepix.com/cut-the-rope/embed",
    rating: "5.0",
    plays: "670K",
    description: "Feed sweet candy to the little green monster Om Nom.",
    status: "approved",
    approved: true
  },
  {
    id: "static-puz-03",
    title: "Brain Test IQ Master",
    category: "Puzzle",
    thumbnail: "https://img.gamepix.com/games/brain-test/cover/brain-test.png",
    url: "https://play.gamepix.com/brain-test/embed",
    rating: "4.9",
    plays: "490K",
    description: "Tricky brain teasers and lateral thinking visual riddles.",
    status: "approved",
    approved: true
  },
  {
    id: "static-foot-01",
    title: "Penalty Shooters 2",
    category: "Football",
    thumbnail: "https://img.gamepix.com/games/penalty-shooters-2/cover/penalty-shooters-2.png",
    url: "https://play.gamepix.com/penalty-shooters-2/embed",
    rating: "4.9",
    plays: "360K",
    description: "Shoot and save penalties in international football leagues.",
    status: "approved",
    approved: true
  },
  {
    id: "static-foot-02",
    title: "Football Legends 2021",
    category: "Football",
    thumbnail: "https://img.gamepix.com/games/football-legends-2021/cover/football-legends-2021.png",
    url: "https://play.gamepix.com/football-legends-2021/embed",
    rating: "4.8",
    plays: "280K",
    description: "Big-head football super kicks with legend players.",
    status: "approved",
    approved: true
  },
  {
    id: "static-sport-01",
    title: "Cricket Hero Live",
    category: "Sports",
    thumbnail: "https://img.gamepix.com/games/cricket-hero/cover/cricket-hero.png",
    url: "https://play.gamepix.com/cricket-hero/embed",
    rating: "4.9",
    plays: "420K",
    description: "Hit towering sixes and chase huge targets with your cricket bat.",
    status: "approved",
    approved: true
  },
  {
    id: "static-arc-01",
    title: "Flappy Bird Fly Quest",
    category: "Arcade",
    thumbnail: "https://img.gamepix.com/games/flappy-bird/cover/flappy-bird.png",
    url: "https://play.gamepix.com/flappy-bird/embed",
    rating: "4.7",
    plays: "390K",
    description: "Tap to flap wings and navigate through retro green pipe gates.",
    status: "approved",
    approved: true
  },
  {
    id: "static-arc-02",
    title: "Pac-Man Arcade Legend",
    category: "Arcade",
    thumbnail: "https://img.gamepix.com/games/pac-man/cover/pac-man.png",
    url: "https://play.gamepix.com/pac-man/embed",
    rating: "4.9",
    plays: "510K",
    description: "Munch dots, evade ghosts, and turn the tables with power pellets.",
    status: "approved",
    approved: true
  },
  {
    id: "static-arc-03",
    title: "Galaxy Attack Alien Shooter",
    category: "Arcade",
    thumbnail: "https://img.gamepix.com/games/galaxy-attack/cover/galaxy-attack.png",
    url: "https://play.gamepix.com/galaxy-attack-alien-shooter/embed",
    rating: "4.9",
    plays: "430K",
    description: "Upgrade your spaceship lasers and shield generators against alien swarms.",
    status: "approved",
    approved: true
  },
  {
    id: "static-strat-01",
    title: "Chess Grandmaster Pro",
    category: "Strategy",
    thumbnail: "https://img.gamepix.com/games/chess-grandmaster/cover/chess-grandmaster.png",
    url: "https://play.gamepix.com/chess-grandmaster/embed",
    rating: "4.9",
    plays: "340K",
    description: "Compete against advanced chess engines with tactical analysis.",
    status: "approved",
    approved: true
  },
  {
    id: "static-strat-02",
    title: "Tower Defense Kingdom",
    category: "Strategy",
    thumbnail: "https://img.gamepix.com/games/tower-defense/cover/tower-defense.png",
    url: "https://play.gamepix.com/tower-defense/embed",
    rating: "4.8",
    plays: "290K",
    description: "Place archers, ballistas, and wizard towers along enemy paths.",
    status: "approved",
    approved: true
  }
];

export default games;

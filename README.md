# 🐅 Bagh Chal 🐐
## Tigers and Goats - A Political Allegory of Nepal

<div align="center">

![Bagh Chal Game](https://img.shields.io/badge/Game-Bagh_Chal-4ECDC4?style=for-the-badge)
![Nepal](https://img.shields.io/badge/Origin-Nepal-DC143C?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)

*An ancient Himalayan strategy game reimagined as a reflection of Nepal's contemporary political landscape*

[Play Now](#installation) • [Game Rules](#game-rules) • [Political Symbolism](#political-symbolism)

</div>

---

## 📖 About the Game

**Bagh Chal** (बाघ चाल - "Tiger's Move") is Nepal's national board game with over 1,000 years of history. This digital adaptation transforms the traditional game into a powerful political metaphor, where the eternal struggle between predator and prey mirrors the complex dynamics of Nepali democracy.

### 🎭 Political Symbolism

This implementation uses Nepal's major political party symbols to represent the game pieces, transforming an ancient pastime into a commentary on modern political dynamics:

#### 🐅 **The Tigers (Political Powers)**
Represented by four major political party symbols:
- **Congress (Tree)** - Established democratic force
- **CPN-UML (Sun)** - Communist influence  
- **Maoist (Hammer & Sickle)** - Revolutionary movement
- **Rastriya Prajatantra Party (Plough)** - Traditional values

The tigers embody **concentrated political power** - fewer in number but individually strong, capable of decisive action, and always hunting for opportunity. Like political parties, they must strategically position themselves, capture resources (goats/votes), and maintain control through tactical movements.

#### 🐐 **The Goats (The People/Ghanti - Bell)**
Represented by the **Ghanti (Bell)** symbol - the voice of the people:

The 20 goats represent **the collective power of citizens** - individually vulnerable but collectively strong when organized. The bell symbolizes:
- **Voice of the masses** that cannot be silenced
- **Democratic awakening** through unity
- **Grassroots movements** that can trap even the most powerful
- **People's resistance** through non-violent coordination

### 🇳🇵 Nepal's Political Reality in Gameplay

The game mechanics perfectly mirror Nepal's political scenario:

1. **Asymmetric Power Dynamics**: Like Nepal's democracy, power is unevenly distributed between political parties (tigers) and citizens (goats).

2. **Coalition Politics**: Tigers (parties) must move strategically and capture opportunities, similar to forming coalition governments in Nepal's fractured political landscape.

3. **People Power**: Goats (citizens) start vulnerable but can win through coordination and strategic positioning - reflecting successful democratic movements like Jana Andolan I & II.

4. **The Placement Phase**: Represents political mobilization - citizens organizing themselves across the nation before they gain full agency (movement phase).

5. **The Win Conditions**: 
   - **Tigers win by capturing 5 goats** = Political parties consolidating power by dividing and conquering the electorate
   - **Goats win by trapping all tigers** = United citizens successfully holding all political forces accountable, achieving true democracy

---

## ✨ Features

### 🎮 Gameplay
- **Two-Phase Strategy**: Placement phase followed by movement phase
- **Player vs AI**: Choose to play as either Tigers (political forces) or Goats (the people)
- **Smart AI Opponent**: Randomized thinking time (0-500ms) for realistic gameplay
- **Visual Feedback**: Blinking pieces indicate active player's turn
- **Win Detection**: Automatic game-end detection with victory screen

### 🎨 Modern Design
- **Political Party Logos**: Authentic symbols for all game pieces
- **Glowing Text Effects**: Modern UI with subtle neon aesthetics  
- **Smooth Animations**: Pulsing pieces, fade-in effects, and transitions
- **Responsive Layout**: Works on desktop and mobile devices
- **Dark Theme**: Eye-friendly interface with vibrant accents

### 🧠 Game Intelligence
- **Strategic AI**: Prioritizes captures and center control
- **Instant First Move**: No delay on opening move
- **Valid Move Indicators**: Visual hints for legal moves
- **Piece Selection**: Click-to-select with highlighted valid destinations

---

## 🛠️ Technologies Used

### Frontend Stack
- **Vite** - Lightning-fast build tool and development server
- **Vanilla JavaScript** - Pure JS for game logic and AI
- **HTML5 Canvas** - Hardware-accelerated game board rendering
- **CSS3** - Modern styling with animations and effects

### Game Architecture
```
BaghChal/
├── index.html          # Main HTML structure
├── style.css           # Game styling and animations
├── main.js             # Core game logic and AI
├── public/
│   └── assets/         # Political party logos and images
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

### Key Algorithms
- **Minimax-inspired AI**: Decision-making for optimal moves
- **Board State Management**: 5×5 grid with adjacency detection
- **Diagonal Line Detection**: Complex movement validation
- **Win Condition Checking**: Real-time trap detection

---

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup Steps

1. **Clone the Repository**
```bash
git clone https://github.com/Neepurna/Bagh-Chal.git
cd Bagh-Chal
```

2. **Install Dependencies**
```bash
npm install
```

3. **Run Development Server**
```bash
npm run dev
```

4. **Open in Browser**
Navigate to `http://localhost:5173` (or the port shown in terminal)

### Production Build
```bash
npm run build
npm run preview
```

---

## 🎯 How to Play

### Game Start
1. Click **"Start New Game"**
2. **Choose Your Side**:
   - 🐐 **Play as Goats** - Defend the people by trapping tigers
   - 🐅 **Play as Tigers** - Consolidate power by capturing goats

### 🐐 Playing as Goats

#### Phase 1: Placement (Mobilization)
- Click any **empty intersection** to place a goat
- Place all **20 goats** strategically
- Goats cannot move during this phase
- Avoid isolated positions that tigers can easily capture

#### Phase 2: Movement (Active Resistance)
- Click a **goat** to select it
- Valid moves will be **highlighted**
- Click a **highlighted spot** to move
- Form **solid lines** - tigers cannot jump over two adjacent goats
- Work towards **trapping all four tigers**

**Goat Victory**: Surround all tigers so none can move

### 🐅 Playing as Tigers

#### Phase 1: Placement
- Click a **tiger** to select it
- Valid moves/captures will be **highlighted**
- Click to **move** or **jump over goats** to capture them
- Try to capture goats before they're all placed

#### Phase 2: Movement  
- Same mechanics as placement phase
- **Capture** by jumping over adjacent goats to empty spaces
- Only **one capture per turn** (no chain jumps)
- Avoid getting cornered or trapped

**Tiger Victory**: Capture **5 or more goats**

---

## 📋 Game Rules

### Board Structure
- **5×5 grid** with 25 intersection points
- Lines connect adjacent intersections (horizontal, vertical, diagonal)
- Pieces move along marked lines only

### Movement Rules
1. **Goats**:
   - Cannot move during placement phase
   - Move one space along any connected line (no jumping)
   - Can only move to empty adjacent intersections

2. **Tigers**:
   - Can move throughout the entire game
   - Move one space along connected lines OR
   - Jump over an adjacent goat to capture it
   - Landing space must be empty and directly beyond the goat
   - Only one capture per turn

### Strategic Tips

**For Goats**:
- 🛡️ Stay in groups - never isolate yourself
- 🎯 Control the center early
- 🧱 Build walls of adjacent goats (tigers can't break through)
- ⏰ Be patient - goats get stronger in late game

**For Tigers**:
- 👑 Dominate the center for maximum mobility
- 🎣 Create "forks" - threaten two goats simultaneously  
- 🔪 Strike early during placement phase
- 🎯 Target isolated or edge-positioned goats

---

## 🏛️ Historical & Cultural Context

### Origins
- **Age**: Over 1,000 years old
- **Origin**: Himalayan herding communities
- **Purpose**: Mental simulation of predator-prey dynamics
- **Status**: National board game of Nepal

### Mathematical Significance
- **Game-theoretic value**: Proven draw with optimal play
- **State-space complexity**: ~33 billion unique positions
- **Solved by**: Lim Yew Jin & Jürg Nievergelt using retrograde analysis

### Cultural Metaphor
Traditionally, Bagh Chal represented the struggle between wildlife (tigers) and livestock (goats) in pastoral communities. This digital version reinterprets that ancient metaphor for modern Nepal - where political forces (tigers) and the collective will of citizens (goats) engage in an eternal strategic dance for control of the nation's destiny.

---

## 🚀 Future Enhancements

### Planned Features
- [ ] Online multiplayer mode
- [ ] AI difficulty levels (Easy, Medium, Hard)
- [ ] Move history and replay
- [ ] Tournament mode with rankings
- [ ] Sound effects and background music
- [ ] Game statistics and analytics
- [ ] Save/load game state
- [ ] Alternative board themes
- [ ] Mobile app versions (iOS/Android)
- [ ] Nepali language support

### Political Edition Expansions
- [ ] Historical political scenarios as pre-set puzzles
- [ ] "Jana Andolan" mode - special victory conditions
- [ ] Coalition mechanics - multiple tiger players
- [ ] Vote-bank visualization system

---

## 🤝 Contributing

Contributions are welcome! This game is a cultural and political project aimed at educating people about both traditional Nepali games and contemporary democratic dynamics.

### How to Contribute
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).

### Asset Credits
- Political party logos: Used for educational and cultural purposes
- Game concept: Traditional Nepali cultural heritage (public domain)

---

## 🙏 Acknowledgments

- **Nepali Heritage**: To the countless generations who preserved this game
- **Political Inspiration**: To the citizens of Nepal who continue to fight for true democracy
- **Game Theory Research**: Lim Yew Jin & Jürg Nievergelt for solving the game mathematically
- **Open Source Community**: For the tools and frameworks that made this possible

---

## 📞 Contact & Support

- **GitHub**: [@Neepurna](https://github.com/Neepurna)
- **Issues**: [Report bugs or request features](https://github.com/Neepurna/Bagh-Chal/issues)

---

<div align="center">

### 🎮 Ready to Play?

```bash
npm install && npm run dev
```

**Choose your side in Nepal's eternal strategic struggle!**

---

*Made with ❤️ for Nepal's democracy and cultural heritage*

</div>

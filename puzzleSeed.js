const mongoose = require('mongoose');
const ChessPuzzle = require('./models/Puzzle'); 
require('dotenv').config();

// Sample chess puzzles for each difficulty level
const samplePuzzles = [
  // Easy puzzles (mate in 1)
  {
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    solution: ['f3d4', 'd4f3'], // Knight captures knight
    difficulty: 'easy',
    description: 'Capture the undefended knight',
    tags: ['capture', 'beginner']
  },
  {
    fen: 'r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    solution: ['c4f7', 'e8f7'], // Bishop captures f7
    difficulty: 'easy',
    description: 'Find the fork',
    tags: ['fork', 'beginner']
  },
  {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 1',
    solution: ['d8h4'],  // Queen delivers mate
    difficulty: 'easy',
    description: 'Mate in 1',
    tags: ['mate', 'beginner']
  },
  
  // Intermediate puzzles (mate in 2, tactics)
  {
    fen: 'r1bqkb1r/ppp2ppp/2n5/3np3/8/3P1NP1/PPP1PPBP/RNBQK2R w KQkq - 0 1',
    solution: ['f3e5', 'c6e5', 'g2b7'], // Knight captures, pawn recaptures, bishop delivers checkmate
    difficulty: 'intermediate',
    description: 'Find the tactic',
    tags: ['sacrifice', 'mate', 'intermediate']
  },
  {
    fen: 'r3k2r/ppp2ppp/2n5/3np3/8/2PP4/PP3PPP/RNBQKBNR b KQkq - 0 1',
    solution: ['d5c3', 'b2c3', 'c6b4'], // Pawn captures, pawn recaptures, knight fork
    difficulty: 'intermediate',
    description: 'Create a knight fork',
    tags: ['fork', 'tactic', 'intermediate']
  },
  {
    fen: 'r1bqk2r/ppp2ppp/2n5/2bpp3/8/2PP1N2/PP2PPPP/RNBQKB1R w KQkq - 0 1',
    solution: ['f3e5', 'd5e4', 'e5c6'], // Knight captures, pawn captures, knight fork
    difficulty: 'intermediate',
    description: 'Find the knight fork',
    tags: ['fork', 'tactic', 'intermediate']
  },
  
  // Hard puzzles (mate in 3+, complex tactics)
  {
    fen: 'r1bqkbnr/pppp1ppp/8/4p3/3P4/2P5/PP2PPPP/RNBQKBNR b KQkq - 0 1',
    solution: ['f8b4', 'c3b4', 'd8h4', 'g2g3', 'h4d4'], // Bishop sacrifice, pawn takes, queen check, pawn blocks, queen checkmate
    difficulty: 'hard',
    description: 'Find the winning combination',
    tags: ['sacrifice', 'mate', 'advanced']
  },
  {
    fen: 'r3k2r/ppp2ppp/2n5/2bpp3/8/2PP1N2/PP2PPPP/RNBQKB1R b KQkq - 0 1',
    solution: ['c5f2', 'e1f2', 'c6d4', 'c3d4', 'd8d4'], // Bishop sac, king takes, knight fork, pawn takes, queen delivers checkmate
    difficulty: 'hard',
    description: 'Find the winning sequence',
    tags: ['sacrifice', 'mate', 'advanced']
  },
  {
    fen: 'rnbqkb1r/pp3ppp/2p5/3pP3/8/2N5/PPPP1PPP/R1BQKBNR w KQkq d6 0 1',
    solution: ['e5d6', 'f8d6', 'c3d5', 'c6d5', 'd1g4'], // Pawn capture, bishop recapture, knight fork, pawn takes, queen attacks
    difficulty: 'hard',
    description: 'Find the tactical sequence',
    tags: ['tactic', 'attack', 'advanced']
  }
];

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
};

// Seed the database
const seedDatabase = async () => {
  try {
    await connectDB();
    
    // Clear existing puzzles
    await ChessPuzzle.deleteMany({});
    console.log('Existing puzzles cleared');
    
    // Insert new puzzles
    await ChessPuzzle.insertMany(samplePuzzles);
    console.log(`${samplePuzzles.length} puzzles inserted successfully`);
    
    process.exit();
  } catch (err) {
    console.error('Error seeding database:', err.message);
    process.exit(1);
  }
};

seedDatabase();
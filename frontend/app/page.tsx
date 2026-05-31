"use client";

import { useState } from "react";

interface Flashcard {
  question: string;
  answer: string;
  ease_factor: number;
  intervals: number;
  repetitions: number;
  next_review_at: string | null;
  distractors?: string[];
}

export default function Home() {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  
  // Dummy data for your app study streak tracker grid (last 14 days)
  const streakActivity = [
    { date: "May 18", count: 2 }, { date: "May 19", count: 0 },
    { date: "May 20", count: 4 }, { date: "May 21", count: 1 },
    { date: "May 22", count: 0 }, { date: "May 23", count: 0 },
    { date: "May 24", count: 5 }, { date: "May 25", count: 2 },
    { date: "May 26", count: 3 }, { date: "May 27", count: 0 },
    { date: "May 28", count: 1 }, { date: "May 29", count: 4 },
    { date: "May 30", count: 2 }, { date: "May 31", count: 6 }, // Today!
  ];

  // Helper function to assign GitHub-style green colors based on study activity counts
  const getColorClass = (count: number) => {
    if (count === 0) return "bg-slate-800"; // No study activity
    if (count <= 2) return "bg-green-900 text-green-100"; // Low activity
    if (count <= 4) return "bg-green-700 text-green-100"; // Medium activity
    return "bg-green-500 text-slate-900"; // High study activity!
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 flex flex-col items-center">
      <div className="max-w-3xl w-full space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-blue-400">🧠 RecallCraft</h1>
          <p className="text-slate-400">Convert passive reading material into active recall structures instantly.</p>
        </div>

        {/* --- STREAK TRACKER VISUAL HEATMAP COMPONENT --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-md font-semibold text-slate-200 flex items-center gap-2">
              🔥 Study Streak Tracker
            </h3>
            <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded-full border border-blue-500/20 font-mono">
              Current Streak: 3 Days
            </span>
          </div>
          
          {/* Grid Layout Container */}
          <div className="flex flex-wrap gap-2 pt-2">
            {streakActivity.map((day, idx) => (
              <div
                key={idx}
                title={`${day.date}: ${day.count} cards generated`}
                className={`w-10 h-10 rounded-md flex flex-col items-center justify-center text-[10px] font-medium font-mono shadow-inner transition-transform hover:scale-110 cursor-pointer ${getColorClass(day.count)}`}
              >
                <span>{day.date.split(" ")[1]}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 pt-1 font-mono">
            <span>Less study</span>
            <span>More active recall ⚡</span>
          </div>
        </div>
        {/* --- END OF STREAK TRACKER COMPONENT --- */}

        {/* Input Interface Block */}
        <div className="space-y-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste your study chapters, textbook concepts, or lecture notes here..."
            className="w-full h-40 p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none shadow-inner"
          />
          <button 
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition duration-200 shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            Generate Flashcards ✨
          </button>
        </div>

      </div>
    </main>
  );
}
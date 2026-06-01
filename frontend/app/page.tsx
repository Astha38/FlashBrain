"use client";

import { useState, useEffect, useMemo } from "react";

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  correct_answer?: string; // compatibility
  mastered: boolean;
  ease_factor?: number;
  intervals?: number;
  repetitions?: number;
  next_review_at?: string | null;
  distractors?: string[];
}

const SAMPLE_NOTES = `Types of Neurons in the Human Body:
1. Sensory Neurons: Triggered by physical or chemical inputs from the environment. They carry sensory signals from the body's receptors to the central nervous system (CNS).
2. Motor Neurons: Carry signals from the CNS to the outer parts of the body, such as muscles, skin, and glands. They control all voluntary muscle movements.
3. Interneurons: Found only in the CNS (brain and spinal cord). They connect sensory and motor neurons, passing signals between them and processing cognitive information.

Active Recall learning is the most effective study technique because it forces the brain to retrieve information rather than passively reviewing it. This strengthens neural connections and improves long-term retention.`;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Home() {
  // Dummy data for study streak tracker grid (last 14 days)
  const streakActivity = [
    { date: "May 18", count: 2 }, { date: "May 19", count: 0 },
    { date: "May 20", count: 4 }, { date: "May 21", count: 1 },
    { date: "May 22", count: 0 }, { date: "May 23", count: 0 },
    { date: "May 24", count: 5 }, { date: "May 25", count: 2 },
    { date: "May 26", count: 3 }, { date: "May 27", count: 0 },
    { date: "May 28", count: 1 }, { date: "May 29", count: 4 },
    { date: "May 30", count: 2 }, { date: "May 31", count: 6 }, // Today!
  ];

  // Helper function to assign green colors based on study activity counts (supporting light/dark mode)
  const getColorClass = (count: number) => {
    if (count === 0) return "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500"; 
    if (count <= 2) return "bg-green-200 dark:bg-green-950 text-green-800 dark:text-green-200"; 
    if (count <= 4) return "bg-green-400 dark:bg-green-800 text-green-950 dark:text-green-150"; 
    return "bg-green-500 dark:bg-green-600 text-slate-950 dark:text-slate-900"; 
  };

  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel");
  const [studyMode, setStudyMode] = useState<"flip" | "quiz">("flip");
  const [notesType, setNotesType] = useState<"text" | "pdf">("text");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [shuffledChoices, setShuffledChoices] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "learning" | "mastered">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Manual card form state
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Authentication State
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authType, setAuthType] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Deck History State
  const [showHistory, setShowHistory] = useState(false);
  const [decks, setDecks] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<number | null>(null);
  const [activeDeckTitle, setActiveDeckTitle] = useState("");

  // Filter & Search Logic
  const filteredCards = useMemo(() => {
    return flashcards.filter((card) => {
      const matchesSearch =
        card.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.answer.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (filterMode === "mastered") return matchesSearch && card.mastered;
      if (filterMode === "learning") return matchesSearch && !card.mastered;
      return matchesSearch;
    });
  }, [flashcards, searchQuery, filterMode]);

  // Load initial state (Theme, Cards, Auth)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("flashbrain-theme");
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const dark = savedTheme ? savedTheme === "dark" : systemDark;
      setIsDarkMode(dark);
      syncTheme(dark);

      // Load Auth Session
      const savedToken = localStorage.getItem("flashbrain-token");
      const savedUsername = localStorage.getItem("flashbrain-username");
      if (savedToken && savedUsername) {
        setToken(savedToken);
        setUsername(savedUsername);
      }

      // Load saved anonymous flashcards if not logged in
      if (!savedToken) {
        const savedCards = localStorage.getItem("flashbrain-cards");
        if (savedCards) {
          try {
            setFlashcards(JSON.parse(savedCards));
          } catch (e) {
            console.error("Failed to parse saved cards", e);
          }
        }
      }
    }
  }, []);

  // Fetch Deck History
  const fetchHistory = async (authToken = token) => {
    if (!authToken) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/decks`, {
        headers: {
          "Authorization": `Bearer ${authToken}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setDecks(data.decks);
      }
    } catch (err) {
      console.error("Failed to fetch deck history", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Sync History when Token changes
  useEffect(() => {
    if (token) {
      fetchHistory(token);
    } else {
      setDecks([]);
      setActiveDeckId(null);
      setActiveDeckTitle("");
    }
  }, [token]);

  // Shuffling logic for Quiz Mode choices
  useEffect(() => {
    if (filteredCards.length > 0 && activeCardIndex < filteredCards.length) {
      const card = filteredCards[activeCardIndex];
      const correct = card.answer || card.correct_answer || "";
      const dist = card.distractors || [];
      
      // Fallback distractors if empty
      const choices = [correct, ...dist];
      if (choices.length < 4) {
        const fakes = ["Option A", "Option B", "Option C", "Option D"];
        let fakeIdx = 0;
        while (choices.length < 4 && fakeIdx < fakes.length) {
          const fake = fakes[fakeIdx++];
          if (!choices.includes(fake)) {
            choices.push(fake);
          }
        }
      }
      
      // Shuffle choices using Fisher-Yates
      const shuffled = [...choices];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      setShuffledChoices(shuffled);
      setSelectedAnswer(null); // Reset choice selection on card change
    } else {
      setShuffledChoices([]);
      setSelectedAnswer(null);
    }
  }, [activeCardIndex, filteredCards, studyMode]);

  // Save anonymous cards to localStorage when updated
  const saveCards = (newCards: Flashcard[]) => {
    setFlashcards(newCards);
    if (!token) {
      localStorage.setItem("flashbrain-cards", JSON.stringify(newCards));
    }
  };

  const syncTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  };

  // Toggle Dark Mode
  const toggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    localStorage.setItem("flashbrain-theme", nextDark ? "dark" : "light");
    syncTheme(nextDark);
  };

  // Toast helper
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Load a deck from History
  const loadDeck = async (deckId: number, title: string, deckNotes: string, authToken = token) => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/decks/${deckId}/cards`, {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setFlashcards(data.flashcards);
        setActiveDeckId(deckId);
        setActiveDeckTitle(title);
        setNotes(deckNotes || data.notes || "");
        setActiveCardIndex(0);
        setIsFlipped(false);
        showToast(`Loaded deck: ${title}`, "success");
      } else {
        showToast(data.error || "Failed to load deck", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load deck from history.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Call backend to generate flashcards
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      showToast("Please enter some study notes first!", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/generate-cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) {
        throw new Error("Server error while generating cards.");
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.flashcards)) {
        const formattedCards = data.flashcards.map((card: any) => ({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          question: card.question,
          correct_answer: card.correct_answer || card.answer,
          answer: card.correct_answer || card.answer, // compatibility
          mastered: false,
          ease_factor: 2.5,
          intervals: 0,
          repetitions: 0,
          next_review_at: null,
          distractors: card.distractors || []
        }));

        // If logged in, save to SQLite automatically
        if (token) {
          const firstLine = notes.trim().split("\n")[0];
          const deckTitle = firstLine.substring(0, 35) + (firstLine.length > 35 ? "..." : "") || "Generated Deck";
          try {
            const saveRes = await fetch(`${API_BASE}/api/decks`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                title: deckTitle,
                notes: notes,
                flashcards: formattedCards
              })
            });
            const saveData = await saveRes.json();
            if (saveData.success) {
              await loadDeck(saveData.deckId, deckTitle, notes, token);
              fetchHistory(token);
              showToast(`Generated and saved deck to history!`, "success");
              setLoading(false);
              return;
            }
          } catch (saveErr) {
            console.error("Failed to auto-save deck", saveErr);
          }
        }

        // Anonymous/Guest Mode
        saveCards(formattedCards);
        setActiveDeckId(null);
        setActiveDeckTitle("");
        setActiveCardIndex(0);
        setIsFlipped(false);
        showToast(`Successfully generated ${formattedCards.length} flashcards!`, "success");
      } else {
        throw new Error(data.error || "Failed to parse API response");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to generate flashcards. Make sure the API server is running.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Toggle Mastered state of a card
  const toggleMastered = async (id: string) => {
    const card = flashcards.find((c) => c.id === id);
    if (!card) return;

    const newMastered = !card.mastered;

    // Update locally
    const updated = flashcards.map((c) =>
      c.id === id ? { ...c, mastered: newMastered } : c
    );
    saveCards(updated);

    // If logged in & editing saved deck, sync to backend db
    if (token && activeDeckId) {
      try {
        await fetch(`${API_BASE}/api/cards/${id}/mastered`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ mastered: newMastered })
        });
        fetchHistory(token);
      } catch (err) {
        console.error("Failed to update card mastery on server", err);
      }
    }

    showToast(
      newMastered
        ? "Card marked as Mastered! ≡ƒÄë"
        : "Card returned to Learning stack.",
      "info"
    );
  };

  // Spaced Repetition card scheduler rating
  const rateCard = async (id: string, rating: number) => {
    const card = flashcards.find((c) => c.id === id);
    if (!card) return;

    let updatedCards = [...flashcards];
    let nextReviewDate = new Date();

    if (token && activeDeckId) {
      try {
        const res = await fetch(`${API_BASE}/api/cards/${id}/mastered`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ rating })
        });
        const data = await res.json();
        if (data.success && data.card) {
          updatedCards = flashcards.map(c => 
            c.id === id ? { 
              ...c, 
              ease_factor: data.card.ease_factor,
              intervals: data.card.intervals,
              repetitions: data.card.repetitions,
              next_review_at: data.card.next_review_at,
              mastered: data.card.mastered
            } : c
          );
          saveCards(updatedCards);
          fetchHistory(token);
        }
      } catch (err) {
        console.error("Failed to submit card rating to server", err);
      }
    } else {
      // Simulate SM-2 locally for guests
      const q = rating;
      let ef = card.ease_factor !== undefined ? card.ease_factor : 2.5;
      let rep = card.repetitions !== undefined ? card.repetitions : 0;
      let interval = card.intervals !== undefined ? card.intervals : 0;

      if (q < 3) {
        rep = 0;
        interval = 1;
      } else {
        if (rep === 0) {
          interval = 1;
        } else if (rep === 1) {
          interval = 6;
        } else {
          interval = Math.round(interval * ef);
        }
        rep += 1;
      }
      ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      if (ef < 1.3) ef = 1.3;

      nextReviewDate.setDate(nextReviewDate.getDate() + interval);
      
      updatedCards = flashcards.map(c => 
        c.id === id ? { 
          ...c, 
          ease_factor: ef,
          intervals: interval,
          repetitions: rep,
          next_review_at: nextReviewDate.toISOString(),
          mastered: q >= 4
        } : c
      );
      saveCards(updatedCards);
    }

    const ratingLabels: Record<number, string> = { 1: "Again (1)", 3: "Hard (3)", 5: "Easy (5)" };
    showToast(`Card rated: ${ratingLabels[rating] || rating}`, "info");

    // Automatically advance to the next card after a small delay in carousel mode (unless in Quiz Mode)
    setTimeout(() => {
      if (viewMode === "carousel" && filteredCards.length > 1 && studyMode !== "quiz") {
        setActiveCardIndex(prev => (prev < filteredCards.length - 1 ? prev + 1 : 0));
        setIsFlipped(false);
      }
    }, 800);
  };

  // Option selection handler for Quiz Mode
  const handleSelectOption = (option: string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(option);
    
    const correct = filteredCards[activeCardIndex].answer || filteredCards[activeCardIndex].correct_answer || "";
    const isCorrect = option === correct;
    
    // Auto rate: correct = Easy (5), incorrect = Again (1)
    rateCard(filteredCards[activeCardIndex].id, isCorrect ? 5 : 1);
  };

  // PDF Document Ingestion Pipeline
  const handlePdfUpload = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      showToast("Only PDF documents are supported!", "error");
      return;
    }
    setLoading(true);
    setPdfUploading(true);
    setPdfProgress(15);
    
    const formData = new FormData();
    formData.append("file", file);
    
    // Simulate upload/extraction progress stages
    const interval = setInterval(() => {
      setPdfProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 12;
      });
    }, 400);

    try {
      const res = await fetch(`${API_BASE}/api/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      clearInterval(interval);
      setPdfProgress(100);

      if (!res.ok) {
        throw new Error("Failed to process the PDF and extract flashcards.");
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.flashcards)) {
        const formattedCards = data.flashcards.map((card: any) => ({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          question: card.question,
          correct_answer: card.correct_answer,
          answer: card.correct_answer, // compatibility
          mastered: false,
          ease_factor: 2.5,
          intervals: 0,
          repetitions: 0,
          next_review_at: null,
          distractors: card.distractors
        }));

        // If logged in, save deck entry to SQLite automatically
        if (token) {
          const deckTitle = file.name.replace(/\.[^/.]+$/, "") || "Uploaded PDF Deck";
          try {
            const saveRes = await fetch(`${API_BASE}/api/decks`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                title: deckTitle,
                notes: `Generated from PDF file: ${file.name}`,
                flashcards: formattedCards
              })
            });
            const saveData = await saveRes.json();
            if (saveData.success) {
              await loadDeck(saveData.deckId, deckTitle, `Generated from PDF file: ${file.name}`, token);
              fetchHistory(token);
              showToast(`PDF parsed and saved to study history!`, "success");
              setLoading(false);
              setPdfUploading(false);
              return;
            }
          } catch (saveErr) {
            console.error("Failed to auto-save PDF deck", saveErr);
          }
        }

        // Guest mode fallback
        saveCards(formattedCards);
        setActiveDeckId(null);
        setActiveDeckTitle("");
        setActiveCardIndex(0);
        setIsFlipped(false);
        showToast(`Successfully generated ${formattedCards.length} cards from PDF!`, "success");
      } else {
        throw new Error(data.error || "Failed to parse flashcard list");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to process PDF. Check if backend is active.", "error");
    } finally {
      setLoading(false);
      setPdfUploading(false);
      setPdfFile(null);
    }
  };

  // Read Aloud Text
  const speakText = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      if (isSpeaking) {
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } else {
      showToast("Speech synthesis is not supported in your browser.", "error");
    }
  };

  // Manual Add Card
  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) {
      showToast("Please fill in both fields!", "error");
      return;
    }
    const newCard: Flashcard = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      question: newQuestion,
      answer: newAnswer,
      mastered: false,
    };

    saveCards([newCard, ...flashcards]);
    setNewQuestion("");
    setNewAnswer("");
    setShowAddForm(false);
    showToast("New flashcard added locally!", "success");
  };

  // Delete specific card
  const handleDeleteCard = (id: string) => {
    const filtered = flashcards.filter((card) => card.id !== id);
    saveCards(filtered);
    if (activeCardIndex >= filtered.length && filtered.length > 0) {
      setActiveCardIndex(filtered.length - 1);
    }
    setIsFlipped(false);
    showToast("Card deleted.", "info");
  };

  // Clear all cards
  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear your current deck?")) {
      saveCards([]);
      setActiveCardIndex(0);
      setIsFlipped(false);
      showToast("All cards cleared.", "info");
    }
  };

  // Export Deck as JSON
  const handleExportJSON = () => {
    if (flashcards.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(flashcards, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "flashbrain_deck.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Deck exported successfully!", "success");
  };

  // Fill in sample notes
  const fillSampleNotes = () => {
    setNotes(SAMPLE_NOTES);
    showToast("Loaded sample study notes!", "info");
  };

  // Delete deck from history
  const handleDeleteDeck = async (deckId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this deck? This cannot be undone.")) return;

    try {
      const res = await fetch(`${API_BASE}/api/decks/${deckId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast("Deck deleted successfully", "info");
        fetchHistory(token);
        if (activeDeckId === deckId) {
          setActiveDeckId(null);
          setActiveDeckTitle("");
          setFlashcards([]);
        }
      } else {
        showToast(data.error || "Failed to delete deck", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting deck.", "error");
    }
  };

  // Submit login or registration form
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      showToast("Please fill in all fields", "error");
      return;
    }

    setAuthLoading(true);
    const endpoint = authType === "login" ? "/api/login" : "/api/register";
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      if (authType === "login") {
        setToken(data.token);
        setUsername(data.username);
        localStorage.setItem("flashbrain-token", data.token);
        localStorage.setItem("flashbrain-username", data.username);
        showToast(`Welcome back, ${data.username}! ≡ƒæï`, "success");
        setShowAuthModal(false);
        setAuthUsername("");
        setAuthPassword("");
      } else {
        showToast("Registration successful! Please sign in now.", "success");
        setAuthType("login");
        setAuthPassword("");
      }
    } catch (err: any) {
      showToast(err.message || "Authentication failed.", "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem("flashbrain-token");
    localStorage.removeItem("flashbrain-username");
    showToast("Logged out successfully.", "info");
  };

  // Calculate stats
  const totalCount = flashcards.length;
  const masteredCount = flashcards.filter((c) => c.mastered).length;
  const learningCount = totalCount - masteredCount;
  const masteryPercentage = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

  // Key navigation for carousel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== "carousel" || filteredCards.length === 0) return;
      if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
        return;
      }

      if (e.key === "ArrowLeft") {
        setActiveCardIndex((prev) => (prev > 0 ? prev - 1 : filteredCards.length - 1));
        setIsFlipped(false);
      } else if (e.key === "ArrowRight") {
        setActiveCardIndex((prev) => (prev < filteredCards.length - 1 ? prev + 1 : 0));
        setIsFlipped(false);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, filteredCards.length]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-all duration-300">
      
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in-down border text-sm font-medium ${
          toast.type === "success" 
            ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-300 backdrop-blur-md" 
            : toast.type === "error"
            ? "bg-rose-950/80 border-rose-500/30 text-rose-300 backdrop-blur-md"
            : "bg-indigo-950/80 border-indigo-500/30 text-indigo-300 backdrop-blur-md"
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            toast.type === "success" ? "bg-emerald-400" : toast.type === "error" ? "bg-rose-400" : "bg-indigo-400"
          }`} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Hero Banner Grid BG */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

      {/* Glowing blobs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <span className="text-xl font-bold text-white">FB</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent dark:from-white dark:to-slate-400">
              FlashBrain
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">AI-Powered Active Recall</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-4">
          
          {/* History Toggle (only if logged in) */}
          {token && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3.5 py-2 rounded-lg glass-effect hover:bg-white/10 dark:hover:bg-white/5 transition-all text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer shadow-md"
              title="View saved decks"
            >
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="hidden sm:inline text-xs font-semibold">My Decks</span>
            </button>
          )}

          <button
            onClick={toggleDarkMode}
            id="theme-toggle"
            className="p-2 rounded-lg glass-effect hover:bg-white/10 dark:hover:bg-white/5 transition-all text-slate-400 hover:text-white"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9h-1m9 4a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Profile / Auth Area */}
          {token ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-slate-200">{username}</span>
                <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase">Sync Active</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
                {username?.substring(0, 2).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
              >
                Log Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthType("login");
                setShowAuthModal(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all cursor-pointer"
            >
              Sign In
            </button>
          )}

        </div>
      </header>

      {/* Main Workspace */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Creator & Notes */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="p-6 rounded-2xl glass-effect shadow-xl flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200">Study Source Ingestion</h2>
              <p className="text-xs text-slate-500 mt-1">Paste your text summaries or upload documents to generate active recall decks.</p>
            </div>

            {/* Ingestion Tabs */}
            <div className="flex gap-1.5 p-1 rounded-xl bg-slate-950/50 border border-white/5">
              <button
                type="button"
                onClick={() => setNotesType("text")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  notesType === "text"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Text Notes
              </button>
              <button
                type="button"
                onClick={() => setNotesType("pdf")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  notesType === "pdf"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                PDF Document
              </button>
            </div>

            {notesType === "text" ? (
              <form onSubmit={handleGenerate} className="flex flex-col gap-4">
                <div className="relative">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter your notes here..."
                    className="w-full h-64 px-4 py-3 text-sm rounded-xl bg-white/80 dark:bg-slate-950/40 border border-slate-300 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/80 resize-none font-sans text-slate-900 dark:text-slate-300 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-500"
                    maxLength={10000}
                  />
                  <span className="absolute bottom-3 right-3 text-[10px] text-slate-600">
                    {notes.length}/10,000
                  </span>
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={fillSampleNotes}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 text-xs font-semibold text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/5 transition-all"
                  >
                    Load Sample Notes
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-indigo-800 disabled:to-violet-800 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generate Cards
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const files = e.dataTransfer.files;
                    if (files && files[0]) {
                      setPdfFile(files[0]);
                    }
                  }}
                  className={`w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all duration-300 ${
                    isDragOver
                      ? "border-indigo-500 bg-indigo-500/10 scale-[0.99]"
                      : pdfFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-white/10 bg-slate-950/40 hover:border-indigo-500/30"
                  }`}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "application/pdf";
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files && files[0]) {
                        setPdfFile(files[0]);
                      }
                    };
                    input.click();
                  }}
                >
                  {pdfFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200 truncate max-w-[220px]">
                          {pdfFile.name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">
                          {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                      <span className="text-[10px] text-indigo-400 font-bold hover:underline">
                        Click to change file
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/5 text-slate-400 flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-300">
                          Drag & drop PDF here
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          or click to browse from files
                        </p>
                      </div>
                      <span className="text-[9px] text-slate-600 bg-white/5 border border-white/5 px-2 py-0.5 rounded-md mt-2 font-medium">
                        Max 10 MB
                      </span>
                    </div>
                  )}
                </div>

                {pdfUploading && (
                  <div className="w-full space-y-2 animate-pulse">
                    <div className="flex justify-between text-xs font-semibold text-slate-400">
                      <span>Parsing Document...</span>
                      <span>{pdfProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 animate-pulse"
                        style={{ width: `${pdfProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {pdfFile && !pdfUploading && (
                    <button
                      type="button"
                      onClick={() => setPdfFile(null)}
                      className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (pdfFile) {
                        handlePdfUpload(pdfFile);
                      } else {
                        showToast("Please choose a PDF file first!", "error");
                      }
                    }}
                    disabled={loading || !pdfFile}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 font-semibold text-xs py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {pdfUploading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Parsing PDF...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Ingest PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Progress Tracker Widget */}
          {totalCount > 0 && (
            <div className="p-6 rounded-2xl glass-effect shadow-xl flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Mastery Progress</h3>
                <p className="text-xs text-slate-500 mt-0.5">Track your active recall stats.</p>
              </div>

              {/* Progress Slider */}
              <div className="w-full flex flex-col gap-2">
                <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                    {masteryPercentage}%
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {masteredCount} / {totalCount} cards
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ease-out"
                    style={{ width: `${masteryPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-1">
                <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950/20 border border-slate-200 dark:border-white/5 text-center">
                  <span className="block text-xl font-bold text-indigo-400">{learningCount}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Learning</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950/20 border border-slate-200 dark:border-white/5 text-center">
                  <span className="block text-xl font-bold text-emerald-400">{masteredCount}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Mastered</span>
                </div>
              </div>
            </div>
          )}

          {/* --- STREAK TRACKER VISUAL HEATMAP COMPONENT --- */}
          <div className="p-6 rounded-2xl glass-effect shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-2">
                🔥 Study Streak Tracker
              </h3>
              <span className="text-xs bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-mono">
                Current Streak: 3 Days
              </span>
            </div>
            
            {/* Grid Layout Container */}
            <div className="flex flex-wrap gap-2 pt-2">
              {streakActivity.map((day, idx) => (
                <div
                  key={idx}
                  title={`${day.date}: ${day.count} cards generated`}
                  className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center text-[9px] font-semibold font-mono shadow-inner transition-all duration-200 hover:scale-110 cursor-pointer ${getColorClass(day.count)}`}
                >
                  <span>{day.date.split(" ")[1]}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 pt-1 font-mono">
              <span>Less study</span>
              <span>More active recall ⚡</span>
            </div>
          </div>
        </section>

        {/* Right Column: Flashcard Decks */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Deck Options Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 rounded-xl glass-effect shadow-md">
            
            {/* View Mode & Study Mode Switches & Active Deck Badge */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-200 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                <button
                  onClick={() => setViewMode("carousel")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === "carousel"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Carousel
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Grid
                </button>
              </div>

              {/* Study Mode: Flip Cards vs Quiz Mode */}
              {viewMode === "carousel" && (
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-200 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                  <button
                    onClick={() => setStudyMode("flip")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      studyMode === "flip"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Flip Cards
                  </button>
                  <button
                    onClick={() => setStudyMode("quiz")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      studyMode === "quiz"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Quiz Mode
                  </button>
                </div>
              )}

              {/* Active Deck Title Badge */}
              {totalCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-300 max-w-[150px] truncate">
                    {activeDeckTitle || "Current Deck"}
                  </span>
                  {activeDeckId ? (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Saved
                    </span>
                  ) : (
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Temporary Session
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Filter stack */}
            <div className="flex items-center gap-2.5">
              <select
                value={filterMode}
                onChange={(e: any) => {
                  setFilterMode(e.target.value);
                  setActiveCardIndex(0);
                }}
                className="bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value="all">Show All Cards</option>
                <option value="learning">Show Learning</option>
                <option value="mastered">Show Mastered</option>
              </select>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveCardIndex(0);
                }}
                placeholder="Search cards..."
                className="bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 dark:placeholder:text-slate-500 w-36 sm:w-48 font-medium"
              />
            </div>
          </div>

          {/* Flashcards Panel */}
          {filteredCards.length === 0 ? (
            <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center p-8 rounded-2xl glass-effect shadow-xl text-center border-dashed border-2 border-white/10">
              <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-5 text-indigo-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-300">No Flashcards Available</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                {flashcards.length === 0
                  ? "Enter some study notes in the left panel and click 'Generate Cards' to create an active recall study deck."
                  : "No cards match your current search or filter criteria. Try adjusting your query."}
              </p>
              
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Custom Card
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6">
              
              {/* CAROUSEL VIEW MODE */}
              {viewMode === "carousel" && (
                <div className="flex flex-col gap-6 items-center">
                  
                  {studyMode === "quiz" ? (
                    <div className="w-full max-w-xl rounded-2xl glass-effect p-8 flex flex-col justify-between shadow-2xl transition-all min-h-80 border border-white/10">
                      {/* Quiz Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full">
                          Quiz Mode
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => speakText(filteredCards[activeCardIndex].question)}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white ${isSpeaking ? "text-indigo-400" : ""}`}
                            title="Listen to question"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Question Text */}
                      <div className="my-6 text-center">
                        <p className="text-base sm:text-lg font-bold leading-relaxed text-slate-900 dark:text-slate-100">
                          {filteredCards[activeCardIndex].question}
                        </p>
                      </div>

                      {/* Multiple Choice Options */}
                      <div className="flex flex-col gap-3 w-full">
                        {shuffledChoices.map((option, idx) => {
                          const correct = filteredCards[activeCardIndex].answer || filteredCards[activeCardIndex].correct_answer || "";
                          const isCorrect = option === correct;
                          const isSelected = selectedAnswer === option;
                          const hasAnswered = selectedAnswer !== null;

                          let optionBtnClass = "w-full text-left px-4 py-3 text-sm rounded-xl border transition-all duration-200 active:scale-[0.99] cursor-pointer flex justify-between items-center ";
                          
                          if (!hasAnswered) {
                            optionBtnClass += "bg-slate-100 hover:bg-slate-200 dark:bg-slate-950/40 dark:hover:bg-slate-900 border-slate-200 dark:border-white/10 hover:border-indigo-500 text-slate-900 dark:text-slate-300";
                          } else if (isCorrect) {
                            optionBtnClass += "bg-emerald-950/40 border-emerald-500 text-emerald-400 font-bold shadow-lg shadow-emerald-500/10";
                          } else if (isSelected) {
                            optionBtnClass += "bg-rose-950/40 border-rose-500 text-rose-400 font-bold shadow-lg shadow-rose-500/10";
                          } else {
                            optionBtnClass += "bg-slate-950/20 border-white/5 text-slate-500 cursor-not-allowed";
                          }

                          return (
                            <button
                              key={idx}
                              onClick={() => handleSelectOption(option)}
                              disabled={hasAnswered}
                              className={optionBtnClass}
                            >
                              <span>{option}</span>
                              {hasAnswered && isCorrect && (
                                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {hasAnswered && isSelected && !isCorrect && (
                                <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {selectedAnswer !== null && (
                        <div className="mt-6 flex flex-col items-center gap-2.5 animate-scale-up">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                            {selectedAnswer === (filteredCards[activeCardIndex].answer || filteredCards[activeCardIndex].correct_answer || "") 
                              ? "≡ƒÄë Correct! SM-2 schedule set to Easy."
                              : "Γ¥î Incorrect. SM-2 schedule set to Again."}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedAnswer(null);
                              if (activeCardIndex < filteredCards.length - 1) {
                                setActiveCardIndex(prev => prev + 1);
                              } else {
                                setActiveCardIndex(0);
                              }
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer"
                          >
                            Next Question
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative w-full max-w-xl h-80 perspective-1000">
                      {/* Inner flippable card */}
                      <div
                        onClick={() => setIsFlipped(!isFlipped)}
                        className={`relative w-full h-full transform-style-3d transition-transform duration-500 cursor-pointer ${
                          isFlipped ? "rotate-y-180" : ""
                        }`}
                      >
                        {/* CARD FRONT */}
                        <div className={`absolute inset-0 backface-hidden rounded-2xl glass-effect p-8 flex flex-col justify-between shadow-2xl transition-all ${
                          filteredCards[activeCardIndex].mastered ? "border-emerald-500/20" : "border-white/10"
                        }`}>
                          
                          {/* Front Header */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full">
                              Question
                            </span>
                            
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => speakText(filteredCards[activeCardIndex].question)}
                                className={`p-2 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white ${isSpeaking ? "text-indigo-400" : ""}`}
                                title="Listen to question"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteCard(filteredCards[activeCardIndex].id)}
                                className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all"
                                title="Delete card"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Front Content */}
                          <div className="flex-1 flex items-center justify-center text-center py-4">
                            <p className="text-lg sm:text-xl font-medium leading-relaxed max-w-md text-slate-900 dark:text-slate-100">
                              {filteredCards[activeCardIndex].question}
                            </p>
                          </div>

                          {/* Front Footer */}
                          <div className="flex justify-between items-center text-xs text-slate-500 font-semibold uppercase">
                            <span>Click card to reveal answer</span>
                            {filteredCards[activeCardIndex].mastered && (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Mastered
                              </span>
                            )}
                          </div>
                        </div>

                        {/* CARD BACK */}
                        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl bg-white dark:bg-slate-900/90 border border-indigo-500/30 p-8 flex flex-col justify-between shadow-2xl transition-all">
                          
                          {/* Back Header */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full">
                              Answer
                            </span>
                            
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => speakText(filteredCards[activeCardIndex].answer || filteredCards[activeCardIndex].correct_answer || "")}
                                className={`p-2 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white ${isSpeaking ? "text-indigo-400" : ""}`}
                                title="Listen to answer"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteCard(filteredCards[activeCardIndex].id)}
                                className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all"
                                title="Delete card"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Back Content */}
                          <div className="flex-1 flex items-center justify-center text-center py-4">
                            <p className="text-base sm:text-lg leading-relaxed max-w-md text-slate-900 dark:text-slate-100 font-medium">
                              {filteredCards[activeCardIndex].answer}
                            </p>
                          </div>

                          {/* Back Footer Spaced Repetition Rating Buttons */}
                          <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Rate recall:</span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => rateCard(filteredCards[activeCardIndex].id, 1)}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                title="Again (Incorrect/Forgot)"
                              >
                                Again
                              </button>
                              <button
                                onClick={() => rateCard(filteredCards[activeCardIndex].id, 3)}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                title="Hard (Correct with effort)"
                              >
                                Hard
                              </button>
                              <button
                                onClick={() => rateCard(filteredCards[activeCardIndex].id, 5)}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                title="Easy (Immediate recall)"
                              >
                                Easy
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Dots and Controls */}
                  <div className="flex items-center justify-between w-full max-w-xl px-4 mt-2">
                    <button
                      onClick={() => {
                        setActiveCardIndex((prev) => (prev > 0 ? prev - 1 : filteredCards.length - 1));
                        setIsFlipped(false);
                      }}
                      className="p-3 rounded-full glass-effect hover:bg-white/10 text-slate-400 hover:text-white transition-all shadow-md cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold text-slate-400">
                        {activeCardIndex + 1} of {filteredCards.length}
                      </span>
                      <div className="flex gap-1">
                        {filteredCards.map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                              i === activeCardIndex ? "w-4 bg-indigo-500" : "bg-slate-700"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setActiveCardIndex((prev) => (prev < filteredCards.length - 1 ? prev + 1 : 0));
                        setIsFlipped(false);
                      }}
                      className="p-3 rounded-full glass-effect hover:bg-white/10 text-slate-400 hover:text-white transition-all shadow-md cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Shortcut Tip */}
                  <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase mt-4">
                    ≡ƒÆí Pro Tip: Use Left/Right Arrow Keys to navigate, Spacebar to flip.
                  </p>
                </div>
              )}

              {/* GRID VIEW MODE */}
              {viewMode === "grid" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredCards.map((card) => (
                    <GridCard
                      key={card.id}
                      card={card}
                      onToggleMastered={toggleMastered}
                      onRate={rateCard}
                      onDelete={handleDeleteCard}
                      onSpeak={speakText}
                      isSpeaking={isSpeaking}
                    />
                  ))}
                </div>
              )}

              {/* Deck management options bottom row */}
              <div className="flex flex-wrap gap-4 items-center justify-between mt-6 border-t border-white/5 pt-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Custom Card
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="px-4 py-2 glass-effect text-slate-300 hover:text-white hover:bg-white/5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export JSON
                  </button>
                </div>
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all border border-rose-500/20 cursor-pointer"
                >
                  Clear Deck
                </button>
              </div>

            </div>
          )}

          {/* Add custom card Modal Overlay */}
          {showAddForm && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-lg glass-effect rounded-2xl shadow-2xl p-6 relative border border-white/10 animate-scale-up">
                
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                  <h3 className="text-base font-semibold text-slate-200">Create Custom Flashcard</h3>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewQuestion("");
                      setNewAnswer("");
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleAddCard} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Question (Front)</label>
                    <input
                      type="text"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      placeholder="e.g. What is the powerhouse of the cell?"
                      className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Answer (Back)</label>
                    <textarea
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      placeholder="e.g. Mitochondria, which generates ATP chemical energy."
                      className="w-full h-24 px-4 py-2.5 text-sm rounded-xl bg-slate-950/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewQuestion("");
                        setNewAnswer("");
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      Add to Deck
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-effect rounded-2xl shadow-2xl p-8 relative border border-white/10 animate-scale-up">
            <button
              onClick={() => {
                setShowAuthModal(false);
                setAuthUsername("");
                setAuthPassword("");
              }}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mx-auto mb-3">
                <span className="text-xl font-bold text-white">FB</span>
              </div>
              <h3 className="text-lg font-bold text-slate-200">
                {authType === "login" ? "Welcome to FlashBrain" : "Create Account"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {authType === "login"
                  ? "Sign in to save your study history and progress."
                  : "Sign up to track and master your study decks."}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó"
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-indigo-800 disabled:to-violet-800 text-white font-semibold text-sm py-3 rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {authLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Please wait...
                  </>
                ) : authType === "login" ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-white/5 pt-4">
              <button
                onClick={() => {
                  setAuthType(authType === "login" ? "register" : "login");
                  setAuthUsername("");
                  setAuthPassword("");
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-all"
              >
                {authType === "login"
                  ? "Don't have an account? Sign Up"
                  : "Already have an account? Sign In"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sleek Sliding History Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-slate-950/90 border-r border-white/5 backdrop-blur-lg transform transition-transform duration-300 ease-in-out ${
        showHistory ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
            <h3 className="text-base font-semibold text-slate-200">Study Decks History</h3>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {historyLoading ? (
              <div className="flex justify-center items-center py-12">
                <svg className="animate-spin h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : decks.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs leading-relaxed">
                No saved study decks yet.<br/>Decks you generate will automatically save to your history list.
              </div>
            ) : (
              decks.map((deck) => {
                const masteredCount = deck.mastered_cards || 0;
                const totalCount = deck.total_cards || 0;
                const percent = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
                
                return (
                  <div
                    key={deck.id}
                    onClick={() => {
                      loadDeck(deck.id, deck.title, deck.notes);
                      setShowHistory(false);
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-left relative group ${
                      activeDeckId === deck.id
                        ? "bg-indigo-600/10 border-indigo-500/50"
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <h4 className="font-semibold text-sm text-slate-200 truncate pr-6">
                        {deck.title}
                      </h4>
                      <button
                        onClick={(e) => handleDeleteDeck(deck.id, e)}
                        className="absolute right-3 top-3.5 p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Deck"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 block mb-3">
                      {new Date(deck.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    
                    {/* Progress slider inside sidebar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-semibold text-slate-400">
                        <span>{percent}% Mastered</span>
                        <span>{masteredCount}/{totalCount} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Backdrop Overlay */}
      {showHistory && (
        <div
          onClick={() => setShowHistory(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 mt-12 gap-4">
        <span>&copy; {new Date().getFullYear()} FlashBrain AI. All rights reserved.</span>
        <div className="flex gap-6">
          <span>Active recall study app</span>
          <span>Powered by Gemini 2.5 Flash</span>
        </div>
      </footer>
    </div>
  );
}

// Separate GridCard Component to maintain independent flip state
interface GridCardProps {
  card: Flashcard;
  onToggleMastered: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onDelete: (id: string) => void;
  onSpeak: (text: string) => void;
  isSpeaking: boolean;
}

function GridCard({ card, onToggleMastered, onRate, onDelete, onSpeak, isSpeaking }: GridCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="w-full h-64 perspective-1000">
      <div
        onClick={() => setFlipped(!flipped)}
        className={`relative w-full h-full transform-style-3d transition-transform duration-500 cursor-pointer ${
          flipped ? "rotate-y-180" : ""
        }`}
      >
        {/* FRONT */}
        <div className={`absolute inset-0 backface-hidden rounded-2xl glass-effect p-6 flex flex-col justify-between shadow-lg transition-all ${
          card.mastered ? "border-emerald-500/20" : "border-white/10"
        }`}>
          
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
              Question
            </span>
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onSpeak(card.question)}
                className={`p-1.5 rounded-md hover:bg-white/5 transition-all text-slate-400 hover:text-white ${isSpeaking ? "text-indigo-400" : ""}`}
                title="Listen"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(card.id)}
                className="p-1.5 rounded-md hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center text-center py-2">
            <p className="text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100 line-clamp-4">
              {card.question}
            </p>
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold uppercase">
            <span>Reveal Answer</span>
            {card.mastered && <span className="text-emerald-400 font-bold">Mastered</span>}
          </div>
        </div>

        {/* BACK */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl bg-white dark:bg-slate-900/90 border border-indigo-500/30 p-6 flex flex-col justify-between shadow-lg transition-all">
          
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
              Answer
            </span>
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onSpeak(card.answer)}
                className={`p-1.5 rounded-md hover:bg-white/5 transition-all text-slate-400 hover:text-white ${isSpeaking ? "text-indigo-400" : ""}`}
                title="Listen"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(card.id)}
                className="p-1.5 rounded-md hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center text-center py-2">
            <p className="text-xs font-medium leading-relaxed text-slate-900 dark:text-slate-100 line-clamp-4 font-medium">
              {card.answer}
            </p>
          </div>

          <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onRate(card.id, 1)}
              className="px-2 py-1 text-[9px] font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all active:scale-95 cursor-pointer"
              title="Again"
            >
              Again
            </button>
            <button
              onClick={() => onRate(card.id, 3)}
              className="px-2 py-1 text-[9px] font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-all active:scale-95 cursor-pointer"
              title="Hard"
            >
              Hard
            </button>
            <button
              onClick={() => onRate(card.id, 5)}
              className="px-2 py-1 text-[9px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95 cursor-pointer"
              title="Easy"
            >
              Easy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

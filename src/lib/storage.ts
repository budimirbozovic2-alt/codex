import { Card, createSection } from "./spaced-repetition";

const CARDS_KEY = "sr-essay-cards";
const CATEGORIES_KEY = "sr-essay-categories";

function migrateCard(card: any): Card {
  if (!card.sections) {
    return {
      id: card.id,
      question: card.question,
      sections: [createSection("Cjelina 1", card.answer || "")],
      category: card.category || "Opšte",
      createdAt: card.createdAt || Date.now(),
    };
  }
  return card;
}

export function loadCards(): Card[] {
  try {
    const data = localStorage.getItem(CARDS_KEY);
    return data ? (JSON.parse(data) as any[]).map(migrateCard) : [];
  } catch {
    return [];
  }
}

export function saveCards(cards: Card[]) {
  localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
}

export function loadCategories(): string[] {
  try {
    const data = localStorage.getItem(CATEGORIES_KEY);
    return data ? JSON.parse(data) : ["Opšte"];
  } catch {
    return ["Opšte"];
  }
}

export function saveCategories(categories: string[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

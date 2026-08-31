/**
 * Suggested opening questions.
 *
 * These are answerable from the Nobler Works sample corpus and span all three
 * document folders, so a first-time reader immediately sees retrieval working
 * across categories. Change them when you change the corpus.
 */
const QUICK_STARTERS = [
  { question: 'What was our Q4 2024 revenue?', category: '💰 Financial' },
  { question: 'How many PTO days do employees get per year?', category: '👥 HR' },
  { question: 'What are the top 5 strategic priorities for 2025?', category: '📝 Meetings' },
  { question: "What's our remote work policy?", category: '👥 HR' },
];

export default function QuickStarters({
  onSelect,
}: {
  onSelect: (question: string) => void;
}) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
      {QUICK_STARTERS.map(({ question, category }) => (
        <button
          key={question}
          onClick={() => onSelect(question)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-sm transition-all hover:border-black hover:shadow-md"
        >
          <span className="block text-xs text-gray-500">{category}</span>
          <span className="text-gray-700">{question}</span>
        </button>
      ))}
    </div>
  );
}

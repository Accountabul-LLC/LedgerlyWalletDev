import type { RecipientSuggestion } from '../recipients';

export function RecipientSuggestions({
  suggestions,
  onPick,
}: {
  suggestions: readonly RecipientSuggestion[];
  onPick: (recipient: RecipientSuggestion) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="recipient-suggestions" aria-label="Matching wallets and contacts">
      {suggestions.map((recipient) => (
        <button
          type="button"
          className="recipient-suggestion"
          key={recipient.key}
          onClick={() => onPick(recipient)}
        >
          <strong>{recipient.label}</strong>
          <span>
            {recipient.source === 'wallet' ? 'Your wallet' : 'Saved contact'}
            {recipient.destinationTag !== undefined ? ` · Tag ${recipient.destinationTag}` : ''}
          </span>
          <span className="mono">{recipient.address}</span>
          {recipient.note ? <span>{recipient.note}</span> : null}
        </button>
      ))}
    </div>
  );
}

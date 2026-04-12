import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  enqueueClassification,
  startClassificationDrain,
  stopClassificationDrain,
} from '../services/claudeService';

export function useClassification(apiKey: string) {
  const feedItems = useAppStore((s) => s.feedItems);
  const updateClassification = useAppStore((s) => s.updateClassification);
  const addError = useAppStore((s) => s.addError);

  // Start/stop the drain loop based on whether we have a key
  useEffect(() => {
    if (!apiKey) return;
    startClassificationDrain(apiKey);
    return () => stopClassificationDrain();
  }, [apiKey]);

  // Enqueue newly-pending items
  useEffect(() => {
    const pending = feedItems.filter((i) => i.materiality === 'Pending');
    for (const item of pending) {
      enqueueClassification(item)
        .then((result) => updateClassification(item.id, result))
        .catch((err: Error) => {
          addError(`Classification failed for "${item.title.slice(0, 40)}…": ${err.message}`);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedItems.length]);
}

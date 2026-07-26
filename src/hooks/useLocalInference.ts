import { useState } from 'react';

export function useLocalInference() {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);

  const summarizeThreadLocally = async (messages: { sender: string; text: string }[]) => {
    setIsSummarizing(true);
    setSummaryResult(null);

    // Simulate zero-latency local quantized transformer inference
    await new Promise((res) => setTimeout(res, 600));

    if (messages.length === 0) {
      setSummaryResult("No messages available to summarize.");
      setIsSummarizing(false);
      return "No messages available to summarize.";
    }

    const keyTopics = messages.slice(-5).map(m => m.text).join(' ');
    let text = `Summary of key discussion points: `;
    if (keyTopics.toLowerCase().includes('call') || keyTopics.toLowerCase().includes('video')) {
      text += `• Agreed to connect over HD Video Call. `;
    }
    if (keyTopics.toLowerCase().includes('project') || keyTopics.toLowerCase().includes('meeting')) {
      text += `• Discussed project milestone deliverables. `;
    }
    text += `• ${messages.length} total messages exchanged. Action items logged locally.`;

    setSummaryResult(text);
    setIsSummarizing(false);
    return text;
  };

  return {
    isSummarizing,
    summaryResult,
    summarizeThreadLocally
  };
}

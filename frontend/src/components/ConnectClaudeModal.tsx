import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, Sparkles, Terminal, X } from 'lucide-react';

interface ConnectClaudeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeNo?: string | null;
  username?: string | null;
}

export const getMcpServerUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return `${window.location.origin}/mcp`;
  }
  const mediaUrl = import.meta.env.VITE_MEDIA_URL as string | undefined;
  if (mediaUrl && mediaUrl.startsWith('https://')) {
    try {
      return `${new URL(mediaUrl).origin}/mcp`;
    } catch {
      // fall through
    }
  }
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      return `${new URL(apiUrl).origin}/mcp`;
    } catch {
      // fall through
    }
  }
  return typeof window !== 'undefined' ? `${window.location.origin}/mcp` : '/mcp';
};

export const ConnectClaudeModal: React.FC<ConnectClaudeModalProps> = ({
  isOpen,
  onClose,
  employeeNo,
  username,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  const mcpUrl = getMcpServerUrl();
  const claudeConnectUrl =
    `https://claude.ai/customize/connectors?modal=add-custom-connector` +
    `&connectorName=${encodeURIComponent('Maintenance Tracker')}` +
    `&connectorUrl=${encodeURIComponent(mcpUrl)}`;
  const cliCommand = `claude mcp add --scope user --transport http maintenance-tracker ${mcpUrl}`;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyText = async (text: string, which: 'url' | 'cli') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedCli(true);
        setTimeout(() => setCopiedCli(false), 2000);
      }
    } catch {
      // Ignore clipboard errors if denied by browser
    }
  };

  const loginHint = employeeNo || username || 'your Employee No. or Username';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="w-full max-w-md rounded-xl bg-surface-container border border-outline-variant shadow-2xl overflow-hidden text-on-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-claude-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D97757]/15 text-[#D97757] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="connect-claude-title" className="text-sm font-semibold text-on-surface">
                Connect with Claude
              </h2>
              <p className="text-[11px] text-on-surface-variant">
                Access your Maintenance Tracker data directly in Claude AI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Primary Claude.ai button */}
          <a
            href={claudeConnectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#D97757] hover:bg-[#c86747] text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Open Claude.ai &amp; Connect</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-90" />
          </a>

          {/* MCP URL Copy Box */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
              MCP Server URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={mcpUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-mono bg-surface-container-low border border-outline-variant text-on-surface focus:outline-none"
              />
              <button
                type="button"
                onClick={() => copyText(mcpUrl, 'url')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface transition-colors cursor-pointer shrink-0"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="rounded-lg bg-surface-container-low border border-outline-variant/70 p-3.5 space-y-2 text-xs text-on-surface-variant">
            <p className="font-semibold text-on-surface text-[11px] uppercase tracking-wider">
              How it works
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
              <li>
                Click <span className="font-medium text-on-surface">Open Claude.ai &amp; Connect</span> (or add a custom connector manually with the URL above).
              </li>
              <li>
                Sign in with your account (<span className="font-mono font-medium text-on-surface">{loginHint}</span>) and password.
              </li>
              <li>
                Click <span className="font-medium text-on-surface">Authorize</span> — Claude will only see data permitted by your role.
              </li>
            </ol>
          </div>

          {/* Claude Code CLI snippet */}
          <div className="space-y-1.5 pt-1 border-t border-outline-variant/60">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                <Terminal className="w-3.5 h-3.5" />
                Claude Code (CLI)
              </span>
              <button
                type="button"
                onClick={() => copyText(cliCommand, 'cli')}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
              >
                {copiedCli ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCli ? 'Copied command' : 'Copy command'}</span>
              </button>
            </div>
            <pre className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant text-[10px] font-mono text-on-surface-variant overflow-x-auto whitespace-pre-wrap break-all">
              {cliCommand}
            </pre>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConnectClaudeModal;

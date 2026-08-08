import { useState } from 'react';
import { Key, Copy, Check, AlertTriangle, Download } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './ApiKeyShowOnce.css';

interface ApiKeyShowOnceProps {
  keyData: {
    key: string;
    name: string;
    type: 'service' | 'vendor';
    keyPrefix: string;
    expiresAt: string | null;
  };
  onClose: () => void;
}

export function ApiKeyShowOnce({ keyData, onClose }: ApiKeyShowOnceProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyData.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      alert('Failed to copy to clipboard');
    }
  };

  const handleDownload = () => {
    const content = `# Helios API Key
# Generated: ${new Date().toISOString()}
# Name: ${keyData.name}
# Type: ${keyData.type}
# Expires: ${keyData.expiresAt || 'Never'}

# KEEP THIS SECURE - This key will not be shown again!

API_KEY=${keyData.key}

# Integration Instructions:
# Add this to your application's environment variables or configuration file
# For HTTP requests, include this header:
# X-API-Key: ${keyData.key}

${keyData.type === 'vendor' ? `
# Vendor Key Requirements:
# You must include actor information with every request:
# X-Actor-Name: "John Smith"
# X-Actor-Email: "john@company.com"
# X-Client-Reference: "TICKET-123" (optional)
` : ''}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helios-api-key-${keyData.keyPrefix.replace('helios_', '')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (!confirmed) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const confirmClose = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  return (
    <div className="api-key-show-once-overlay">
      <div className="api-key-show-once-modal">
        <div className="show-once-header">
          <div className="header-icon">
            <Key size={24} />
          </div>
          <h2>API Key Created Successfully</h2>
          <p>Save this key securely - it will not be shown again</p>
        </div>

        <div className="show-once-warning">
          <AlertTriangle size={20} />
          <div className="warning-text">
            <strong>Important Security Notice</strong>
            <p>
              This is the only time you'll see this API key. Helios does not store the plaintext key.
              If you lose this key, you'll need to generate a new one.
            </p>
          </div>
        </div>

        <div className="show-once-body">
          <div className="key-info">
            <div className="info-row">
              <span className="info-label">Key Name:</span>
              <span className="info-value">{keyData.name}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Key Type:</span>
              <span className={`info-badge type-${keyData.type}`}>
                {keyData.type === 'service' ? 'Service Key' : 'Vendor Key'}
              </span>
            </div>
            {keyData.expiresAt && (
              <div className="info-row">
                <span className="info-label">Expires:</span>
                <span className="info-value">
                  {new Date(keyData.expiresAt).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="key-display">
            <label>Your API Key:</label>
            <div className="key-container">
              <code className="key-value">{keyData.key}</code>
              <button className="copy-button" onClick={handleCopy} title="Copy to clipboard">
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="show-once-actions">
            <button className="action-button download" onClick={handleDownload}>
              <Download size={18} />
              Download .txt file
            </button>
            <button className="action-button copy" onClick={handleCopy}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>

          {keyData.type === 'vendor' && (
            <div className="integration-info vendor">
              <h4>Vendor Key Requirements</h4>
              <p>When making API requests, you must include actor information:</p>
              <div className="code-example">
                <code>
                  X-API-Key: {keyData.key}
                  <br />
                  X-Actor-Name: "John Smith"
                  <br />
                  X-Actor-Email: "john@company.com"
                  <br />
                  X-Client-Reference: "TICKET-123" <span className="optional">(optional)</span>
                </code>
              </div>
            </div>
          )}

          {keyData.type === 'service' && (
            <div className="integration-info service">
              <h4>Integration Example</h4>
              <p>Add this header to your HTTP requests:</p>
              <div className="code-example">
                <code>X-API-Key: {keyData.key}</code>
              </div>
            </div>
          )}
        </div>

        <div className="show-once-footer">
          <label className="confirmation-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I have saved this API key in a secure location</span>
          </label>

          <button
            className="btn-primary-large"
            onClick={handleClose}
            disabled={!confirmed}
          >
            Done - Close Window
          </button>
        </div>

        {!confirmed && (
          <div className="close-warning">
            Please confirm that you've saved the key before closing
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showCloseConfirm}
        title="Close Without Saving?"
        message="Are you sure? This API key will never be shown again. Make sure you've saved it securely."
        variant="danger"
        confirmText="Close Anyway"
        onConfirm={confirmClose}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import {
  Loader2,
  Save,
  TestTube,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Bot,
  Zap,
  Server,
  Activity,
  BarChart3,
  ExternalLink,
  Wrench,
  MessageSquare,
  Users,
  UsersRound,
  FileText,
  Terminal,
  HelpCircle,
  Shield,
  UserCog,
  UserCheck,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { ToggleSwitch } from '@/components/ui';
import { authFetch } from '../../config/api';

type AIRole = 'viewer' | 'operator' | 'admin';
import './AISettings.css';

interface MCPToolsConfig {
  help: boolean;
  users: boolean;
  groups: boolean;
  reports: boolean;
  commands: boolean;
}

interface AIConfig {
  isConfigured: boolean;
  isEnabled: boolean;
  primaryEndpointUrl: string;
  primaryModel: string;
  hasPrimaryApiKey: boolean;
  fallbackEndpointUrl: string | null;
  fallbackModel: string | null;
  hasFallbackApiKey: boolean;
  toolCallModel: string | null;
  maxTokensPerRequest: number;
  temperature: number;
  contextWindowTokens: number;
  requestsPerMinuteLimit: number;
  tokensPerDayLimit: number;
  // MCP configuration
  mcpEnabled: boolean;
  mcpTools: MCPToolsConfig;
  // Custom prompt configuration
  useCustomPrompt: boolean;
  customSystemPrompt: string;
  // AI Role
  aiRole: AIRole;
}

interface TestResult {
  success: boolean;
  message: string;
  modelInfo?: {
    model: string;
    responseTime: number;
  };
  error?: string;
}

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  errorRate: number;
  byDay: Array<{ date: string; requests: number; tokens: number }>;
  byModel: Array<{ model: string; requests: number; tokens: number }>;
}

interface OllamaModel {
  name: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
  digest: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  estimatedToolSupport: 'likely' | 'unlikely' | 'unknown';
}

interface ToolTestResult {
  supportsTools: boolean;
  testResult: 'success' | 'no_tool_call' | 'parse_error' | 'error';
  details: string;
}

interface AISettingsProps {
  organizationId: string;
  onViewUsage?: () => void;
  onConfigSaved?: () => void;
}

const COMMON_ENDPOINTS = [
  { label: 'Custom URL', value: '' },
  { label: 'OpenAI', value: 'https://api.openai.com/v1' },
  { label: 'Azure OpenAI', value: '' },
  { label: 'Ollama', value: 'http://localhost:11434/v1' },
  { label: 'LiteLLM', value: 'http://localhost:4000/v1' },
  { label: 'vLLM', value: 'http://localhost:8000/v1' },
  { label: 'OpenRouter', value: 'https://openrouter.ai/api/v1' },
  { label: 'Groq', value: 'https://api.groq.com/openai/v1' },
  { label: 'Together AI', value: 'https://api.together.xyz/v1' },
  { label: 'Anthropic (via proxy)', value: '' },
];

const COMMON_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'llama3.1:70b',
  'llama3.1:8b',
  'mixtral:8x7b'
];

export function AISettings({ organizationId, onViewUsage, onConfigSaved }: AISettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<'primary' | 'fallback' | null>(null);
  const [testResult, setTestResult] = useState<{ type: 'primary' | 'fallback'; result: TestResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPrimaryKey, setShowPrimaryKey] = useState(false);
  const [showFallbackKey, setShowFallbackKey] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  // Form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [primaryEndpointUrl, setPrimaryEndpointUrl] = useState('https://api.openai.com/v1');
  const [primaryApiKey, setPrimaryApiKey] = useState('');
  const [primaryModel, setPrimaryModel] = useState('gpt-4o');
  const [hasPrimaryApiKey, setHasPrimaryApiKey] = useState(false);

  const [enableFallback, setEnableFallback] = useState(false);
  const [fallbackEndpointUrl, setFallbackEndpointUrl] = useState('');
  const [fallbackApiKey, setFallbackApiKey] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');
  const [hasFallbackApiKey, setHasFallbackApiKey] = useState(false);

  const [toolCallModel, setToolCallModel] = useState('');
  const [enableToolCallModel, setEnableToolCallModel] = useState(false);

  const [maxTokensPerRequest, setMaxTokensPerRequest] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [requestsPerMinuteLimit, setRequestsPerMinuteLimit] = useState(20);
  const [tokensPerDayLimit, setTokensPerDayLimit] = useState(100000);

  // MCP Server configuration
  const [enableMcp, setEnableMcp] = useState(false);
  const [mcpTools, setMcpTools] = useState({
    help: true,
    users: true,
    groups: true,
    reports: true,
    commands: true
  });

  // System prompt configuration
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);

  // AI Role
  const [aiRole, setAiRole] = useState<AIRole>('viewer');

  // Model discovery state
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Tool support test state
  const [toolTestResult, setToolTestResult] = useState<ToolTestResult | null>(null);
  const [testingTools, setTestingTools] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchUsage();
  }, [organizationId]);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/v1/ai/config');

      const data = await response.json();
      if (data.success && data.data.isConfigured) {
        const config: AIConfig = data.data;
        setIsEnabled(config.isEnabled);
        setPrimaryEndpointUrl(config.primaryEndpointUrl);
        setPrimaryModel(config.primaryModel);
        setHasPrimaryApiKey(config.hasPrimaryApiKey);

        if (config.fallbackEndpointUrl) {
          setEnableFallback(true);
          setFallbackEndpointUrl(config.fallbackEndpointUrl);
          setFallbackModel(config.fallbackModel || '');
          setHasFallbackApiKey(config.hasFallbackApiKey);
        }

        if (config.toolCallModel) {
          setEnableToolCallModel(true);
          setToolCallModel(config.toolCallModel);
        }

        setMaxTokensPerRequest(config.maxTokensPerRequest);
        setTemperature(config.temperature);
        setRequestsPerMinuteLimit(config.requestsPerMinuteLimit);
        setTokensPerDayLimit(config.tokensPerDayLimit);

        // Load MCP configuration
        setEnableMcp(config.mcpEnabled ?? false);
        if (config.mcpTools) {
          setMcpTools(config.mcpTools);
        }

        // Load custom prompt configuration
        setUseCustomPrompt(config.useCustomPrompt ?? false);
        setCustomSystemPrompt(config.customSystemPrompt || '');

        // Load AI role
        setAiRole(config.aiRole || 'viewer');
      }
    } catch (err) {
      console.error('Failed to fetch AI config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const response = await authFetch('/api/v1/ai/usage?days=30');

      const data = await response.json();
      if (data.success) {
        setUsageStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch AI usage:', err);
    }
  };

  const handleTestConnection = async (type: 'primary' | 'fallback') => {
    setIsTesting(type);
    setTestResult(null);

    try {
      const endpoint = type === 'primary' ? primaryEndpointUrl : fallbackEndpointUrl;
      const apiKey = type === 'primary' ? primaryApiKey : fallbackApiKey;
      const model = type === 'primary' ? primaryModel : fallbackModel;

      const response = await authFetch('/api/v1/ai/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ endpoint, apiKey: apiKey || undefined, model })
      });

      const data = await response.json();
      setTestResult({ type, result: data.data || data });
    } catch (err: any) {
      setTestResult({
        type,
        result: { success: false, message: 'Test failed', error: err.message }
      });
    } finally {
      setIsTesting(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const config: Record<string, any> = {
        isEnabled,
        primaryEndpointUrl,
        primaryModel,
        maxTokensPerRequest,
        temperature,
        requestsPerMinuteLimit,
        tokensPerDayLimit,
        // MCP configuration
        mcpEnabled: enableMcp,
        mcpTools: enableMcp ? mcpTools : { help: true, users: true, groups: true, reports: true, commands: true },
        // Custom prompt configuration
        useCustomPrompt,
        customSystemPrompt: useCustomPrompt ? customSystemPrompt : null,
        // AI Role
        aiRole
      };

      // Only include API key if it's been changed
      if (primaryApiKey) {
        config.primaryApiKey = primaryApiKey;
      }

      if (enableFallback && fallbackEndpointUrl && fallbackModel) {
        config.fallbackEndpointUrl = fallbackEndpointUrl;
        config.fallbackModel = fallbackModel;
        if (fallbackApiKey) {
          config.fallbackApiKey = fallbackApiKey;
        }
      } else {
        config.fallbackEndpointUrl = null;
        config.fallbackModel = null;
        config.fallbackApiKey = null;
      }

      if (enableToolCallModel && toolCallModel) {
        config.toolCallModel = toolCallModel;
      } else {
        config.toolCallModel = null;
      }

      const response = await authFetch('/api/v1/ai/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      const data = await response.json();
      if (data.success) {
        setSuccessMessage('AI configuration saved successfully');
        // Clear API key fields after save (they're now stored)
        setPrimaryApiKey('');
        setFallbackApiKey('');
        setHasPrimaryApiKey(true);
        if (enableFallback) {
          setHasFallbackApiKey(true);
        }
        // Notify parent that config was saved (to refresh AI status)
        onConfigSaved?.();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.message || 'Failed to save configuration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const discoverModels = async () => {
    if (!primaryEndpointUrl) {
      setModelsError('Please enter an endpoint URL first');
      return;
    }

    setLoadingModels(true);
    setModelsError(null);
    try {
      // Pass the endpoint URL from the form, not the saved config
      const response = await authFetch(`/api/v1/ai/models?endpoint=${encodeURIComponent(primaryEndpointUrl)}`);

      const data = await response.json();
      if (data.success) {
        setAvailableModels(data.data.models);
        if (data.data.models.length === 0) {
          setModelsError('No models found. Make sure Ollama is running and has models installed.');
        }
      } else {
        setModelsError(data.message || 'Failed to discover models');
      }
    } catch (err: any) {
      setModelsError(err.message || 'Failed to connect to Ollama');
    } finally {
      setLoadingModels(false);
    }
  };

  const testToolSupport = async () => {
    if (!primaryEndpointUrl || !primaryModel) return;

    setTestingTools(true);
    setToolTestResult(null);
    try {
      const response = await authFetch('/api/v1/ai/test-tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endpoint: primaryEndpointUrl,
          apiKey: primaryApiKey || undefined,
          model: primaryModel
        })
      });

      const data = await response.json();
      if (data.success) {
        setToolTestResult(data.data);
      } else {
        setToolTestResult({
          supportsTools: false,
          testResult: 'error',
          details: data.message || 'Test failed'
        });
      }
    } catch (err: any) {
      setToolTestResult({
        supportsTools: false,
        testResult: 'error',
        details: err.message || 'Test failed'
      });
    } finally {
      setTestingTools(false);
    }
  };

  const getToolSupportBadge = (support: 'likely' | 'unlikely' | 'unknown') => {
    switch (support) {
      case 'likely':
        return <span className="tool-badge likely">Tools: Likely</span>;
      case 'unlikely':
        return <span className="tool-badge unlikely">Tools: Unlikely</span>;
      default:
        return <span className="tool-badge unknown">Tools: Unknown</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="ai-settings-loading">
        <Loader2 className="spin" size={24} />
        <span>Loading AI configuration...</span>
      </div>
    );
  }

  return (
    <div className="ai-settings">
      <div className="ai-settings-section ai-settings-enable-section">
        <div className="enable-row">
          <div className="enable-info">
            <Bot size={20} className="enable-icon" />
            <div>
              <strong>Enable AI Assistant</strong>
              <p>Allow users to interact with an AI assistant powered by your choice of LLM provider</p>
            </div>
          </div>
          <ToggleSwitch
            checked={isEnabled}
            onChange={setIsEnabled}
          />
        </div>
      </div>

      {error && (
        <div className="ai-settings-error">
          <XCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="ai-settings-success">
          <CheckCircle size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="ai-settings-section">
        <div className="section-title">
          <Server size={18} />
          <span>Primary Model</span>
          <span className="required-badge">Required</span>
        </div>

        <div className="form-group">
          <label>Endpoint URL</label>
          <input
            type="text"
            value={primaryEndpointUrl}
            onChange={(e) => setPrimaryEndpointUrl(e.target.value)}
            placeholder="http://your-server:11434/v1"
          />
          <span className="form-hint">
            Any OpenAI-compatible endpoint. Examples: http://ollama-server:11434/v1, http://10.10.10.200:11434/v1, http://litellm:4000/v1
          </span>
          <div className="endpoint-presets">
            <span className="presets-label">Quick fill:</span>
            {COMMON_ENDPOINTS.filter(ep => ep.value).map(ep => (
              <button
                key={ep.label}
                type="button"
                className={`preset-btn ${primaryEndpointUrl === ep.value ? 'active' : ''}`}
                onClick={() => setPrimaryEndpointUrl(ep.value)}
              >
                {ep.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>API Key {!hasPrimaryApiKey && <span className="optional">(optional for local models)</span>}</label>
          <div className="input-with-toggle">
            <input
              type={showPrimaryKey ? 'text' : 'password'}
              value={primaryApiKey}
              onChange={(e) => setPrimaryApiKey(e.target.value)}
              placeholder={hasPrimaryApiKey ? '••••••••••••••••••••' : 'sk-...'}
            />
            <button
              type="button"
              className="toggle-visibility"
              onClick={() => setShowPrimaryKey(!showPrimaryKey)}
            >
              {showPrimaryKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {hasPrimaryApiKey && !primaryApiKey && (
            <span className="form-hint success">API key is configured. Enter a new key to replace it.</span>
          )}
        </div>

        <div className="form-group">
          <label>Model Name</label>
          <div className="model-selector-row">
            {/* When models are discovered, show dropdown. Otherwise show text input */}
            {availableModels.length > 0 ? (
              <select
                className="form-input model-select"
                value={primaryModel}
                onChange={(e) => {
                  setPrimaryModel(e.target.value);
                  setToolTestResult(null);
                }}
              >
                <option value="">Select a model...</option>
                {availableModels.map(m => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.sizeFormatted}) {m.estimatedToolSupport === 'likely' ? '✓ Tools' : m.estimatedToolSupport === 'unlikely' ? '✗ No Tools' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={primaryModel}
                onChange={(e) => {
                  setPrimaryModel(e.target.value);
                  setToolTestResult(null);
                }}
                placeholder="gpt-4o, llama3.1:8b, etc."
                className="model-input"
                list="primary-models"
              />
            )}
            <datalist id="primary-models">
              {COMMON_MODELS.map(m => <option key={m} value={m} />)}
            </datalist>
            <button
              type="button"
              onClick={discoverModels}
              disabled={loadingModels || !primaryEndpointUrl}
              className="btn-secondary discover-btn"
              title="Discover available models from Ollama/vLLM"
            >
              {loadingModels ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              {availableModels.length > 0 ? 'Refresh' : 'Discover'}
            </button>
          </div>
          {availableModels.length > 0 ? (
            <span className="form-hint success">
              <CheckCircle size={12} /> {availableModels.length} models discovered from server
            </span>
          ) : (
            <span className="form-hint">
              Model identifier (e.g., gpt-4o, llama3.1:70b). Click Discover for Ollama/vLLM servers.
            </span>
          )}

          {/* Show selected model info when using discovered models */}
          {primaryModel && availableModels.find(m => m.name === primaryModel) && (
            <div className="selected-model-info">
              {(() => {
                const selected = availableModels.find(m => m.name === primaryModel);
                if (!selected) return null;
                return (
                  <>
                    <span className="model-detail"><strong>Size:</strong> {selected.sizeFormatted}</span>
                    <span className="model-detail">{getToolSupportBadge(selected.estimatedToolSupport)}</span>
                  </>
                );
              })()}
            </div>
          )}

          {modelsError && (
            <div className="models-error">
              <AlertTriangle size={14} />
              <span>{modelsError}</span>
            </div>
          )}
        </div>

        <div className="form-actions-row">
          <button
            className="btn-secondary"
            onClick={() => handleTestConnection('primary')}
            disabled={!primaryEndpointUrl || !primaryModel || isTesting === 'primary'}
          >
            {isTesting === 'primary' ? (
              <><Loader2 className="spin" size={16} /> Testing...</>
            ) : (
              <><TestTube size={16} /> Test Connection</>
            )}
          </button>

          <button
            className="btn-secondary"
            onClick={testToolSupport}
            disabled={!primaryEndpointUrl || !primaryModel || testingTools}
            title="Test if this model supports function/tool calling"
          >
            {testingTools ? (
              <><Loader2 className="spin" size={16} /> Testing...</>
            ) : (
              <><Wrench size={16} /> Test Tool Support</>
            )}
          </button>

          {testResult?.type === 'primary' && (
            <div className={`test-result ${testResult.result.success ? 'success' : 'error'}`}>
              {testResult.result.success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Connected to {testResult.result.modelInfo?.model} ({testResult.result.modelInfo?.responseTime}ms)</span>
                </>
              ) : (
                <>
                  <XCircle size={16} />
                  <span>{testResult.result.error || 'Connection failed'}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Tool test result */}
        {toolTestResult && (
          <div className={`tool-test-result ${toolTestResult.supportsTools ? 'success' : 'warning'}`}>
            {toolTestResult.supportsTools ? (
              <>
                <CheckCircle size={16} />
                <span>Model supports tool/function calling</span>
              </>
            ) : (
              <>
                <AlertTriangle size={16} />
                <div className="tool-test-details">
                  <span>{toolTestResult.details}</span>
                  {toolTestResult.testResult === 'no_tool_call' && (
                    <span className="tool-test-hint">Try using qwen2.5-coder:latest or llama3.1 for tool support.</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ai-settings-section">
        <div className="section-title">
          <Zap size={18} />
          <span>Fallback Model</span>
          <span className="optional-badge">Optional</span>
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enableFallback}
            onChange={(e) => setEnableFallback(e.target.checked)}
          />
          <span>Enable fallback model (used when primary fails)</span>
        </label>

        {enableFallback && (
          <>
            <div className="form-group">
              <label>Endpoint URL</label>
              <input
                type="text"
                value={fallbackEndpointUrl}
                onChange={(e) => setFallbackEndpointUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </div>

            <div className="form-group">
              <label>API Key <span className="optional">(optional)</span></label>
              <div className="input-with-toggle">
                <input
                  type={showFallbackKey ? 'text' : 'password'}
                  value={fallbackApiKey}
                  onChange={(e) => setFallbackApiKey(e.target.value)}
                  placeholder={hasFallbackApiKey ? '••••••••••••••••••••' : 'Leave empty for local models'}
                />
                <button
                  type="button"
                  className="toggle-visibility"
                  onClick={() => setShowFallbackKey(!showFallbackKey)}
                >
                  {showFallbackKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Model Name</label>
              <input
                type="text"
                value={fallbackModel}
                onChange={(e) => setFallbackModel(e.target.value)}
                placeholder="llama3.1:70b"
                list="fallback-models"
              />
              <datalist id="fallback-models">
                {COMMON_MODELS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>

            <div className="form-actions-row">
              <button
                className="btn-secondary"
                onClick={() => handleTestConnection('fallback')}
                disabled={!fallbackEndpointUrl || !fallbackModel || isTesting === 'fallback'}
              >
                {isTesting === 'fallback' ? (
                  <><Loader2 className="spin" size={16} /> Testing...</>
                ) : (
                  <><TestTube size={16} /> Test Connection</>
                )}
              </button>

              {testResult?.type === 'fallback' && (
                <div className={`test-result ${testResult.result.success ? 'success' : 'error'}`}>
                  {testResult.result.success ? (
                    <>
                      <CheckCircle size={16} />
                      <span>Connected ({testResult.result.modelInfo?.responseTime}ms)</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={16} />
                      <span>{testResult.result.error || 'Connection failed'}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tool Call Model Section */}
      <div className="ai-settings-section">
        <div className="section-title">
          <Zap size={18} />
          <span>Tool Call Model</span>
          <span className="optional-badge">Optional</span>
        </div>
        <p className="section-description">
          Use a different model for requests that include tool/function calls.
          This allows you to use a smaller, faster model for simple queries and a more capable model for tool calls.
        </p>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enableToolCallModel}
              onChange={(e) => setEnableToolCallModel(e.target.checked)}
            />
            <span className="checkbox-text">Use separate model for tool calls</span>
          </label>
        </div>

        {enableToolCallModel && (
          <div className="form-group">
            <label>Tool Call Model</label>
            <input
              type="text"
              value={toolCallModel}
              onChange={(e) => setToolCallModel(e.target.value)}
              placeholder="gpt-4o (leave empty to use primary model)"
              list="tool-models"
            />
            <datalist id="tool-models">
              {COMMON_MODELS.map(m => <option key={m} value={m} />)}
            </datalist>
            <p className="form-hint">
              When tool calls are detected, this model will be used instead of the primary model.
              Recommended: Use a model with strong function calling support like gpt-4o.
            </p>
          </div>
        )}
      </div>

      {/* MCP Server Configuration */}
      <div className="ai-settings-section">
        <div className="section-title">
          <Wrench size={18} />
          <span>MCP Server & Tools</span>
          <span className="optional-badge">Optional</span>
        </div>
        <p className="section-description">
          Enable the Model Context Protocol (MCP) server to give AI assistants access to Helios data through structured tools.
        </p>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enableMcp}
              onChange={(e) => setEnableMcp(e.target.checked)}
            />
            <span className="checkbox-text">Enable MCP Server</span>
          </label>
        </div>

        {enableMcp && (
          <div className="mcp-tools-section">
            <label className="tools-label">Available Tools:</label>
            <div className="tools-grid">
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={mcpTools.help}
                  onChange={(e) => setMcpTools({ ...mcpTools, help: e.target.checked })}
                />
                <HelpCircle size={16} />
                <span>Help Search</span>
                <small>Search documentation and guides</small>
              </label>
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={mcpTools.users}
                  onChange={(e) => setMcpTools({ ...mcpTools, users: e.target.checked })}
                />
                <Users size={16} />
                <span>User Tools</span>
                <small>List, get, and query users</small>
              </label>
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={mcpTools.groups}
                  onChange={(e) => setMcpTools({ ...mcpTools, groups: e.target.checked })}
                />
                <UsersRound size={16} />
                <span>Group Tools</span>
                <small>List, get, and compare groups</small>
              </label>
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={mcpTools.reports}
                  onChange={(e) => setMcpTools({ ...mcpTools, reports: e.target.checked })}
                />
                <FileText size={16} />
                <span>Report Tools</span>
                <small>Generate reports and stats</small>
              </label>
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={mcpTools.commands}
                  onChange={(e) => setMcpTools({ ...mcpTools, commands: e.target.checked })}
                />
                <Terminal size={16} />
                <span>Command Tools</span>
                <small>Generate API commands and scripts</small>
              </label>
            </div>
            <p className="form-hint">
              All tools are read-only. The AI cannot modify data, only query it and generate commands for users to execute.
            </p>
          </div>
        )}
      </div>

      {/* AI Role Configuration */}
      {enableMcp && (
        <div className="ai-settings-section">
          <div className="section-title">
            <Shield size={18} />
            <span>AI Role & Permissions</span>
          </div>
          <p className="section-description">
            Control what the AI assistant can do. Choose the appropriate permission level for your organization.
          </p>

          <div className="role-selector">
            <label
              className={`role-option ${aiRole === 'viewer' ? 'selected' : ''}`}
              onClick={() => setAiRole('viewer')}
            >
              <input
                type="radio"
                name="aiRole"
                value="viewer"
                checked={aiRole === 'viewer'}
                onChange={() => setAiRole('viewer')}
              />
              <div className="role-icon viewer">
                <UserCheck size={20} />
              </div>
              <div className="role-info">
                <strong>Viewer</strong>
                <span className="role-badge safe">Safest</span>
                <p>Read-only access. Can query data and provide command syntax, but cannot execute any operations.</p>
                <ul className="role-permissions">
                  <li className="can">Query users, groups, sync status</li>
                  <li className="can">Search documentation and commands</li>
                  <li className="cannot">Cannot execute any commands</li>
                  <li className="cannot">Cannot modify any data</li>
                </ul>
              </div>
            </label>

            <label
              className={`role-option ${aiRole === 'operator' ? 'selected' : ''}`}
              onClick={() => setAiRole('operator')}
            >
              <input
                type="radio"
                name="aiRole"
                value="operator"
                checked={aiRole === 'operator'}
                onChange={() => setAiRole('operator')}
              />
              <div className="role-icon operator">
                <UserCog size={20} />
              </div>
              <div className="role-info">
                <strong>Operator</strong>
                <span className="role-badge moderate">Moderate</span>
                <p>Can query data and execute safe read operations. Cannot create, modify, or delete records.</p>
                <ul className="role-permissions">
                  <li className="can">Query users, groups, sync status</li>
                  <li className="can">Trigger data synchronization</li>
                  <li className="can">Execute read-only commands</li>
                  <li className="cannot">Cannot create/modify/delete data</li>
                </ul>
              </div>
            </label>

            <label
              className={`role-option ${aiRole === 'admin' ? 'selected' : ''}`}
              onClick={() => setAiRole('admin')}
            >
              <input
                type="radio"
                name="aiRole"
                value="admin"
                checked={aiRole === 'admin'}
                onChange={() => setAiRole('admin')}
              />
              <div className="role-icon admin">
                <Shield size={20} />
              </div>
              <div className="role-info">
                <strong>Administrator</strong>
                <span className="role-badge caution">Use with caution</span>
                <p>Full access to all operations. Can query data and execute any command on behalf of users.</p>
                <ul className="role-permissions">
                  <li className="can">Full read access to all data</li>
                  <li className="can">Create, modify, delete users</li>
                  <li className="can">Manage groups and memberships</li>
                  <li className="warning">Will confirm destructive actions</li>
                </ul>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* System Prompt Configuration */}
      <div className="ai-settings-section">
        <div className="section-title">
          <MessageSquare size={18} />
          <span>System Prompt</span>
          <span className="optional-badge">Optional</span>
        </div>
        <p className="section-description">
          Customize the system prompt that defines how the AI assistant behaves. Leave empty to use the default Helios prompt.
        </p>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useCustomPrompt}
              onChange={(e) => setUseCustomPrompt(e.target.checked)}
            />
            <span className="checkbox-text">Use custom system prompt</span>
          </label>
        </div>

        {useCustomPrompt && (
          <div className="form-group">
            <label>Custom System Prompt</label>
            <textarea
              value={customSystemPrompt}
              onChange={(e) => setCustomSystemPrompt(e.target.value)}
              placeholder="You are a helpful AI assistant for Helios..."
              rows={8}
              className="system-prompt-textarea"
            />
            <p className="form-hint">
              This prompt is sent at the start of every conversation. Include instructions about tone, capabilities, and limitations.
            </p>
          </div>
        )}
      </div>

      <div className="ai-settings-section">
        <div className="section-title">
          <Activity size={18} />
          <span>Usage Limits</span>
        </div>

        <div className="form-row">
          <div className="form-group half">
            <label>Max tokens per request</label>
            <input
              type="number"
              value={maxTokensPerRequest}
              onChange={(e) => setMaxTokensPerRequest(parseInt(e.target.value) || 4096)}
              min={100}
              max={128000}
            />
          </div>

          <div className="form-group half">
            <label>Temperature</label>
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.7)}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group half">
            <label>Requests per minute limit</label>
            <input
              type="number"
              value={requestsPerMinuteLimit}
              onChange={(e) => setRequestsPerMinuteLimit(parseInt(e.target.value) || 20)}
              min={1}
              max={1000}
            />
          </div>

          <div className="form-group half">
            <label>Tokens per day limit</label>
            <input
              type="number"
              value={tokensPerDayLimit}
              onChange={(e) => setTokensPerDayLimit(parseInt(e.target.value) || 100000)}
              min={1000}
              max={10000000}
            />
          </div>
        </div>
      </div>

      {usageStats && usageStats.totalRequests > 0 && (
        <div className="ai-settings-section">
          <div className="section-title">
            <Activity size={18} />
            <span>Usage (Last 30 Days)</span>
            {onViewUsage && (
              <button className="view-usage-btn" onClick={onViewUsage}>
                <BarChart3 size={14} />
                <span>View Detailed Usage</span>
                <ExternalLink size={12} />
              </button>
            )}
          </div>

          <div className="usage-stats-grid">
            <div className="usage-stat">
              <div className="usage-stat-value">{usageStats.totalRequests.toLocaleString()}</div>
              <div className="usage-stat-label">Total Requests</div>
            </div>
            <div className="usage-stat">
              <div className="usage-stat-value">{usageStats.totalTokens.toLocaleString()}</div>
              <div className="usage-stat-label">Total Tokens</div>
            </div>
            <div className="usage-stat">
              <div className="usage-stat-value">{usageStats.avgLatencyMs}ms</div>
              <div className="usage-stat-label">Avg Latency</div>
            </div>
            <div className="usage-stat">
              <div className="usage-stat-value">{(usageStats.errorRate * 100).toFixed(1)}%</div>
              <div className="usage-stat-label">Error Rate</div>
            </div>
          </div>
        </div>
      )}

      <div className="ai-settings-footer">
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={isSaving || !primaryEndpointUrl || !primaryModel}
        >
          {isSaving ? (
            <><Loader2 className="spin" size={16} /> Saving...</>
          ) : (
            <><Save size={16} /> Save Configuration</>
          )}
        </button>
      </div>
    </div>
  );
}

export default AISettings;

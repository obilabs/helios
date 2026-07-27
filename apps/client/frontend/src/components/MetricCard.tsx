import React from 'react';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import './MetricCard.css';

export type MetricCardSize = 'small' | 'medium' | 'large';
export type MetricState = 'default' | 'success' | 'warning' | 'error';

interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  label: string;
  footer?: string;
  state?: MetricState;
  size?: MetricCardSize;
  platformColor?: string;
  trend?: 'up' | 'down' | null;
  trendValue?: string;
  onClick?: () => void;
  gridColumn?: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  title,
  value,
  label,
  footer,
  state = 'default',
  size = 'medium',
  platformColor: _platformColor,
  trend,
  trendValue,
  onClick,
  gridColumn = 3,
}) => {
  const classNames = [
    'metric-card',
    `size-${size}`,
    state !== 'default' ? `state-${state}` : '',
    onClick ? 'clickable' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      onClick={onClick}
      style={{ gridColumn: `span ${gridColumn}` }}
    >
      {/* Header */}
      <div className="metric-card-header">
        <div className="metric-card-icon">
          {icon}
        </div>
        <span className="metric-card-title">{title}</span>
      </div>

      {/* Main Value */}
      <div className="metric-card-content">
        <div className="metric-card-value">
          {state === 'warning' && <AlertTriangle size={16} />}
          {value}
        </div>
        <div className="metric-card-label">{label}</div>
      </div>

      {/* Footer with trend or timestamp */}
      {(footer || trend) && (
        <div className="metric-card-footer">
          {trend && (
            <div className={`metric-card-trend ${trend}`}>
              {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trendValue && <span>{trendValue}</span>}
            </div>
          )}
          {footer && <span className="metric-card-timestamp">{footer}</span>}
        </div>
      )}
    </div>
  );
};

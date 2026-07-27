import { useState } from 'react';
import { Laptop, Monitor, Smartphone, Printer, Server, Globe, Package, Plus, Search, FileBarChart, Eye, Pencil, Trash2, Key, HardDrive } from 'lucide-react';
import './Pages.css';

interface Asset {
  id: string;
  name: string;
  type: string;
  serialNumber: string;
  assignedTo: string | null;
  status: string;
  location: string;
  purchaseDate: string;
  value: number;
}

interface AssetManagementProps {
  organizationId: string;
}

export function AssetManagement({ organizationId: _organizationId }: AssetManagementProps) {
  const [assets] = useState<Asset[]>([
    {
      id: '1',
      name: 'MacBook Pro 16"',
      type: 'Laptop',
      serialNumber: 'MBP-2023-001',
      assignedTo: 'john.doe@gridworx.io',
      status: 'Active',
      location: 'San Francisco Office',
      purchaseDate: '2023-06-15',
      value: 2999
    },
    {
      id: '2',
      name: 'Dell UltraSharp 27"',
      type: 'Monitor',
      serialNumber: 'DELL-MON-2023-045',
      assignedTo: 'jane.smith@gridworx.io',
      status: 'Active',
      location: 'New York Office',
      purchaseDate: '2023-08-20',
      value: 599
    },
    {
      id: '3',
      name: 'iPhone 15 Pro',
      type: 'Mobile Device',
      serialNumber: 'IP15-2024-789',
      assignedTo: 'mike@gridworx.io',
      status: 'Active',
      location: 'Remote',
      purchaseDate: '2024-01-10',
      value: 1199
    }
  ]);

  const [activeView, setActiveView] = useState<'devices' | 'software' | 'licenses'>('devices');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Laptop':
        return <Laptop size={24} />;
      case 'Monitor':
        return <Monitor size={24} />;
      case 'Mobile Device':
      case 'Tablet':
        return <Smartphone size={24} />;
      case 'Printer':
        return <Printer size={24} />;
      case 'Server':
        return <Server size={24} />;
      case 'Network':
        return <Globe size={24} />;
      default:
        return <Package size={24} />;
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Active': '#4caf50',
      'Inactive': '#f44336',
      'Maintenance': '#ff9800',
      'Retired': '#9e9e9e'
    };
    return colors[status] || '#9e9e9e';
  };

  const filteredAssets = assets.filter((asset: Asset) => {
    const matchesType = filterType === 'all' || asset.type === filterType;
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          asset.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (asset.assignedTo && asset.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Asset Management</h1>
          <p>Track and manage organization devices, software, and licenses</p>
        </div>
        <button className="btn-primary">
          <Plus size={16} /> Add Asset
        </button>
      </div>

      <div className="asset-tabs">
        <button
          className={`tab-button ${activeView === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveView('devices')}
        >
          <Laptop size={16} /> Devices
        </button>
        <button
          className={`tab-button ${activeView === 'software' ? 'active' : ''}`}
          onClick={() => setActiveView('software')}
        >
          <HardDrive size={16} /> Software
        </button>
        <button
          className={`tab-button ${activeView === 'licenses' ? 'active' : ''}`}
          onClick={() => setActiveView('licenses')}
        >
          <Key size={16} /> Licenses
        </button>
      </div>

      {activeView === 'devices' && (
        <>
          <div className="page-controls">
            <div className="search-box">
              <span className="search-icon"><Search size={16} /></span>
              <input
                type="text"
                placeholder="Search assets, serial numbers, or users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="Laptop">Laptops</option>
              <option value="Monitor">Monitors</option>
              <option value="Mobile Device">Mobile Devices</option>
              <option value="Tablet">Tablets</option>
              <option value="Printer">Printers</option>
            </select>

            <button className="btn-secondary">
              <FileBarChart size={16} /> Export Inventory
            </button>
          </div>

          <div className="data-grid">
            <div className="grid-header">
              <div className="col-wide">Asset Details</div>
              <div className="col-medium">Assigned To</div>
              <div className="col-small">Status</div>
              <div className="col-medium">Location</div>
              <div className="col-small">Value</div>
              <div className="col-small">Actions</div>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon"><Package size={32} /></span>
                <h3>No assets found</h3>
                <p>Start by adding your organization's devices and equipment</p>
              </div>
            ) : (
              <div className="grid-body">
                {filteredAssets.map((asset: Asset) => (
                  <div key={asset.id} className="grid-row">
                    <div className="col-wide">
                      <div className="item-info">
                        <div className="item-icon">
                          {getTypeIcon(asset.type)}
                        </div>
                        <div>
                          <div className="item-name">{asset.name}</div>
                          <div className="item-description">
                            {asset.type} &middot; {asset.serialNumber}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-medium">
                      <span className="email-text">
                        {asset.assignedTo || 'Unassigned'}
                      </span>
                    </div>
                    <div className="col-small">
                      <span
                        className="type-badge"
                        style={{
                          backgroundColor: getStatusColor(asset.status),
                          color: 'white'
                        }}
                      >
                        {asset.status}
                      </span>
                    </div>
                    <div className="col-medium">
                      <span className="location-text">{asset.location}</span>
                    </div>
                    <div className="col-small">
                      <span className="value-text">${asset.value}</span>
                    </div>
                    <div className="col-small">
                      <div className="action-buttons">
                        <button className="btn-icon" title="View details"><Eye size={16} /></button>
                        <button className="btn-icon" title="Edit asset"><Pencil size={16} /></button>
                        <button className="btn-icon danger" title="Retire asset"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="asset-summary">
            <div className="summary-card">
              <div className="summary-label">Total Assets</div>
              <div className="summary-value">{assets.length}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Value</div>
              <div className="summary-value">
                ${assets.reduce((sum: number, asset: Asset) => sum + asset.value, 0).toLocaleString()}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Assigned</div>
              <div className="summary-value">
                {assets.filter((a: Asset) => a.assignedTo).length}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Available</div>
              <div className="summary-value">
                {assets.filter((a: Asset) => !a.assignedTo).length}
              </div>
            </div>
          </div>
        </>
      )}

      {activeView === 'software' && (
        <div className="empty-state">
          <span className="empty-icon"><HardDrive size={32} /></span>
          <h3>Software Management</h3>
          <p>Track installed software, versions, and compliance across your organization.</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>Requires device enrollment integration</p>
        </div>
      )}

      {activeView === 'licenses' && (
        <div className="empty-state">
          <span className="empty-icon"><Key size={32} /></span>
          <h3>License Management</h3>
          <p>Manage software licenses, renewals, and compliance tracking.</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>Requires software tracking integration</p>
        </div>
      )}
    </div>
  );
}
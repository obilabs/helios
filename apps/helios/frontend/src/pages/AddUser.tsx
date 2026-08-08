import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, UserPlus, Users, FileSpreadsheet, Trash2, AlertCircle, CheckCircle, X, User, Mail, Key, Save, Loader, Plus } from 'lucide-react';
import { authFetch } from '../config/api';
import './AddUser.css';

type ViewMode = 'single' | 'bulk' | 'csv';
type PasswordMethod = 'email_link' | 'admin_set';

interface BulkUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department: string;
  jobTitle: string;
  isValid: boolean;
  errors: string[];
}

export function AddUser() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  // Dropdown data for form fields
  const [departments, setDepartments] = useState<any[]>([]);
  const [jobTitles, setJobTitles] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [selectedLicenseId, setSelectedLicenseId] = useState('');

  // Provider integration status
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const [createInGoogle, setCreateInGoogle] = useState(true);
  const [createInMicrosoft, setCreateInMicrosoft] = useState(false);

  // Check edit mode on mount
  useEffect(() => {
    // Fetch dropdown data
    fetchDropdownData();

    // Check if we're in edit mode
    const editId = searchParams.get('edit');
    if (editId) {
      setIsEditMode(true);
      setEditUserId(editId);
      fetchUserForEdit(editId);
    }
  }, [navigate, searchParams]);

  const fetchDropdownData = async () => {
    // Fetch departments
    try {
      const deptResponse = await authFetch('/api/v1/organization/departments');
      if (deptResponse.ok) {
        const data = await deptResponse.json();
        if (data.success) setDepartments(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }

    // Fetch job titles
    try {
      const jtResponse = await authFetch('/api/v1/organization/job-titles');
      if (jtResponse.ok) {
        const data = await jtResponse.json();
        if (data.success) setJobTitles(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching job titles:', error);
    }

    // Fetch managers (active users)
    try {
      const managersResponse = await authFetch('/api/v1/organization/users?status=active&limit=100');
      if (managersResponse.ok) {
        const data = await managersResponse.json();
        setManagers(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching managers:', error);
    }

    // Fetch locations
    try {
      const locResponse = await authFetch('/api/v1/organization/locations');
      if (locResponse.ok) {
        const data = await locResponse.json();
        if (data.success) setLocations(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    }

    // Fetch licenses
    try {
      const licenseResponse = await authFetch('/api/v1/organization/licenses');
      if (licenseResponse.ok) {
        const data = await licenseResponse.json();
        if (data.success) setLicenses(data.data?.licenses || []);
      }
    } catch (error) {
      console.error('Error fetching licenses:', error);
    }

    // Check integration status
    try {
      const statsResponse = await authFetch('/api/v1/dashboard/stats');
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        if (data.success) {
          setGoogleEnabled(data.data?.google?.connected || false);
          setMicrosoftEnabled(data.data?.microsoft?.connected || false);
        }
      }
    } catch (error) {
      console.error('Error fetching integration status:', error);
    }
  };

  const fetchUserForEdit = async (userId: string) => {
    try {
      setIsLoadingUser(true);
      const response = await authFetch(`/api/v1/organization/users`);

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      const user = data.data?.find((u: any) => u.id === userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Pre-populate form with user data
      setFormData({
        email: user.email || '',
        firstName: user.firstName || user.first_name || '',
        lastName: user.lastName || user.last_name || '',
        password: '',
        alternateEmail: user.alternateEmail || '',
        expiryHours: '48',
        jobTitle: user.jobTitle || user.job_title || '',
        department: user.department || '',
        organizationalUnit: user.organizationalUnit || user.organizational_unit || '',
        location: user.location || '',
        reportingManager: user.reportingManagerId || '',
        mobilePhone: user.mobilePhone || user.mobile_phone || '',
        workPhone: user.workPhone || user.work_phone || '',
        secondaryEmails: [],
        groups: [],
        role: user.role || 'user',
        customFields: {
          githubId: user.githubUsername || user.github_username || '',
          jumpcloudId: user.jumpcloudUserId || user.jumpcloud_user_id || '',
          slackId: user.slackUserId || user.slack_user_id || '',
          associateId: user.associateId || user.associate_id || '',
          employmentType: user.employeeType || user.employee_type || 'Full Time',
        }
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingUser(false);
    }
  };

  // Single User Form State
  const [passwordMethod, setPasswordMethod] = useState<PasswordMethod>('email_link');
  const [formData, setFormData] = useState({
    // Basic Info
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    alternateEmail: '',
    expiryHours: '48',

    // Profile Info
    jobTitle: '',
    department: '',
    organizationalUnit: '',
    location: '',
    reportingManager: '',

    // Contact Info
    mobilePhone: '',
    workPhone: '',
    secondaryEmails: [] as string[],

    // Groups & Access
    groups: [] as string[],
    role: 'user',

    // Custom Fields
    customFields: {
      githubId: '',
      jumpcloudId: '',
      slackId: '',
      associateId: '',
      employmentType: 'Full Time',
    }
  });

  const [newSecondaryEmail, setNewSecondaryEmail] = useState('');
  const [searchGroup, setSearchGroup] = useState('');

  // Bulk User Creation State
  const [bulkUsers, setBulkUsers] = useState<BulkUserRow[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<{success: number; failed: number; errors: string[]} | null>(null);

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedData, setCsvParsedData] = useState<BulkUserRow[]>([]);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomFieldChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      customFields: { ...prev.customFields, [field]: value }
    }));
  };

  const addSecondaryEmail = () => {
    if (newSecondaryEmail && !formData.secondaryEmails.includes(newSecondaryEmail)) {
      setFormData(prev => ({
        ...prev,
        secondaryEmails: [...prev.secondaryEmails, newSecondaryEmail]
      }));
      setNewSecondaryEmail('');
    }
  };

  const removeSecondaryEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      secondaryEmails: prev.secondaryEmails.filter(e => e !== email)
    }));
  };

  const addGroup = (group: string) => {
    if (group && !formData.groups.includes(group)) {
      setFormData(prev => ({
        ...prev,
        groups: [...prev.groups, group]
      }));
    }
  };

  const removeGroup = (group: string) => {
    setFormData(prev => ({
      ...prev,
      groups: prev.groups.filter(g => g !== group)
    }));
  };

  // ===== BULK USER FUNCTIONS =====

  const generateId = () => Math.random().toString(36).substring(2, 11);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateBulkRow = (row: BulkUserRow): BulkUserRow => {
    const errors: string[] = [];

    if (!row.email) {
      errors.push('Email is required');
    } else if (!validateEmail(row.email)) {
      errors.push('Invalid email format');
    }

    if (!row.firstName) {
      errors.push('First name is required');
    }

    if (!row.lastName) {
      errors.push('Last name is required');
    }

    // Check for duplicate emails
    const duplicateEmails = bulkUsers.filter(u => u.id !== row.id && u.email.toLowerCase() === row.email.toLowerCase());
    if (duplicateEmails.length > 0) {
      errors.push('Duplicate email in list');
    }

    return {
      ...row,
      isValid: errors.length === 0,
      errors
    };
  };

  const addBulkRow = () => {
    const newRow: BulkUserRow = {
      id: generateId(),
      email: '',
      firstName: '',
      lastName: '',
      role: 'user',
      department: '',
      jobTitle: '',
      isValid: false,
      errors: ['Email is required', 'First name is required', 'Last name is required']
    };
    setBulkUsers(prev => [...prev, newRow]);
  };

  const updateBulkRow = (id: string, field: keyof BulkUserRow, value: string) => {
    setBulkUsers(prev => {
      const updated = prev.map(row => {
        if (row.id === id) {
          const updatedRow = { ...row, [field]: value };
          return validateBulkRow(updatedRow);
        }
        return row;
      });
      // Re-validate all rows to check for duplicate emails
      return updated.map(row => validateBulkRow(row));
    });
  };

  const removeBulkRow = (id: string) => {
    setBulkUsers(prev => {
      const filtered = prev.filter(row => row.id !== id);
      // Re-validate remaining rows
      return filtered.map(row => validateBulkRow(row));
    });
  };

  const handleSubmitBulk = async () => {
    setError(null);
    setSuccess(null);
    setBulkResults(null);
    setBulkSubmitting(true);

    const validUsers = bulkUsers.filter(u => u.isValid);
    if (validUsers.length === 0) {
      setError('No valid users to create. Please fix all errors first.');
      setBulkSubmitting(false);
      return;
    }

    try {
      let successCount = 0;
      let failedCount = 0;
      const errorMessages: string[] = [];

      for (const user of validUsers) {
        try {
          const response = await authFetch('/api/v1/organization/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
              department: user.department || null,
              jobTitle: user.jobTitle || null,
              passwordSetupMethod: 'email_link',
              alternateEmail: user.email, // Use same email as alternate for now
            })
          });

          const data = await response.json();

          if (data.success) {
            successCount++;
          } else {
            failedCount++;
            errorMessages.push(`${user.email}: ${data.error || 'Failed to create'}`);
          }
        } catch (err: any) {
          failedCount++;
          errorMessages.push(`${user.email}: ${err.message}`);
        }
      }

      setBulkResults({
        success: successCount,
        failed: failedCount,
        errors: errorMessages
      });

      if (successCount > 0) {
        setSuccess(`Successfully created ${successCount} user(s)`);
        // Remove successfully created users from the list
        const failedEmails = errorMessages.map(e => e.split(':')[0]);
        setBulkUsers(prev => prev.filter(u => failedEmails.includes(u.email)));
      }

      if (failedCount > 0 && successCount === 0) {
        setError(`Failed to create users. See errors below.`);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ===== CSV IMPORT FUNCTIONS =====

  const parseCSV = (content: string): BulkUserRow[] => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Check for alternate header names
    const hasEmail = headers.includes('email') || headers.includes('email_address');
    const hasFirstName = headers.includes('firstname') || headers.includes('first_name') || headers.includes('given_name');
    const hasLastName = headers.includes('lastname') || headers.includes('last_name') || headers.includes('family_name');

    if (!hasEmail || !hasFirstName || !hasLastName) {
      throw new Error(`CSV must include email, firstName, and lastName columns. Found headers: ${headers.join(', ')}`);
    }

    const getColumnValue = (row: string[], header: string, alternates: string[] = []): string => {
      const allHeaders = [header, ...alternates];
      for (const h of allHeaders) {
        const index = headers.indexOf(h.toLowerCase());
        if (index !== -1 && row[index]) {
          return row[index].trim().replace(/^["']|["']$/g, '');
        }
      }
      return '';
    };

    const users: BulkUserRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < headers.length) continue;

      const row: BulkUserRow = {
        id: generateId(),
        email: getColumnValue(values, 'email', ['email_address']),
        firstName: getColumnValue(values, 'firstname', ['first_name', 'given_name']),
        lastName: getColumnValue(values, 'lastname', ['last_name', 'family_name']),
        role: getColumnValue(values, 'role') || 'user',
        department: getColumnValue(values, 'department', ['dept']),
        jobTitle: getColumnValue(values, 'jobtitle', ['job_title', 'title', 'position']),
        isValid: false,
        errors: []
      };

      users.push(validateBulkRow(row));
    }

    return users;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvError(null);
    setCsvParsing(true);

    try {
      const content = await file.text();
      const parsedUsers = parseCSV(content);
      setCsvParsedData(parsedUsers);

      if (parsedUsers.length === 0) {
        setCsvError('No valid data rows found in CSV');
      }
    } catch (err: any) {
      setCsvError(err.message);
      setCsvParsedData([]);
    } finally {
      setCsvParsing(false);
    }
  };

  const handleImportCSV = () => {
    if (csvParsedData.length === 0) return;
    setBulkUsers(csvParsedData);
    setViewMode('bulk');
    setCsvFile(null);
    setCsvParsedData([]);
  };

  const downloadCSVTemplate = () => {
    const template = 'email,firstName,lastName,role,department,jobTitle\njohn.doe@example.com,John,Doe,user,Engineering,Software Engineer\njane.smith@example.com,Jane,Smith,manager,Sales,Sales Manager';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitSingle = async () => {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      // Validation
      if (!formData.email || !formData.firstName || !formData.lastName) {
        throw new Error('Email, First Name, and Last Name are required');
      }

      // Only validate password for new users
      if (!isEditMode) {
        if (passwordMethod === 'admin_set' && !formData.password) {
          throw new Error('Password is required when admin sets password');
        }

        if (passwordMethod === 'email_link' && !formData.alternateEmail) {
          throw new Error('Alternate email is required for password setup link');
        }
      }

      const requestBody: any = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,

        // Extended profile fields
        jobTitle: formData.jobTitle,
        department: formData.department,
        organizationalUnit: formData.organizationalUnit,
        location: formData.location,
        reportingManagerId: formData.reportingManager || null,
        mobilePhone: formData.mobilePhone,
        workPhone: formData.workPhone,

        // Platform integration fields
        githubUsername: formData.customFields.githubId,
        slackUserId: formData.customFields.slackId,
        jumpcloudUserId: formData.customFields.jumpcloudId,
        associateId: formData.customFields.associateId,
        employeeType: formData.customFields.employmentType,

        // Secondary emails and groups (will handle separately)
        secondaryEmails: formData.secondaryEmails,
        groups: formData.groups,
      };

      // Only include password setup fields for new users
      if (!isEditMode) {
        requestBody.passwordSetupMethod = passwordMethod;

        if (passwordMethod === 'admin_set') {
          requestBody.password = formData.password;
        } else {
          requestBody.alternateEmail = formData.alternateEmail;
          requestBody.expiryHours = parseInt(formData.expiryHours);
        }

        // Provider options
        requestBody.createInGoogle = createInGoogle && googleEnabled;
        requestBody.createInMicrosoft = createInMicrosoft && microsoftEnabled;

        // License assignment
        if (selectedLicenseId) {
          requestBody.licenseId = selectedLicenseId;
        }
      }

      const url = isEditMode
        ? `/api/v1/organization/users/${editUserId}`
        : '/api/v1/organization/users';

      const response = await authFetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'create'} user`);
      }

      // Check for partial success (e.g., user created but GW creation failed)
      const hasGwWarning = data.providerStatus?.google?.requested && !data.providerStatus?.google?.success;
      const hasMsWarning = data.providerStatus?.microsoft?.requested && !data.providerStatus?.microsoft?.success;

      // Use server message which includes provider status details
      const message = data.message || `User ${formData.email} ${isEditMode ? 'updated' : 'created'} successfully!`;

      // Show as warning if provider creation failed
      if (hasGwWarning || hasMsWarning) {
        setError(message); // Use error state to show warning styling
      } else {
        setSuccess(message);
      }

      // Reset form or redirect (with extra time for warnings)
      const delay = (hasGwWarning || hasMsWarning) ? 4000 : 2000;
      setTimeout(() => {
        navigate('/admin/users');
      }, delay);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSingleUserForm = () => (
    <div className="add-user-form">
      <div className="form-section">
        <h3 className="section-title">Basic Information</h3>

        {/* Email */}
        <div className="form-group">
          <label>Primary Email <span className="required">*</span></label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="user@example.com"
            disabled={isSubmitting}
          />
        </div>

        {/* Name Fields */}
        <div className="form-row">
          <div className="form-group">
            <label>First Name <span className="required">*</span></label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              placeholder="John"
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label>Last Name <span className="required">*</span></label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              placeholder="Doe"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Role */}
        <div className="form-group">
          <label>Role <span className="required">*</span></label>
          <select
            value={formData.role}
            onChange={(e) => handleInputChange('role', e.target.value)}
            disabled={isSubmitting}
          >
            <option value="user">User</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {/* Provider Selection - only show for new users */}
      {!isEditMode && (googleEnabled || microsoftEnabled) && (
        <div className="form-section">
          <h3 className="section-title">Create User In</h3>
          <div className="provider-options" style={{ display: 'flex', gap: '1.5rem' }}>
            {googleEnabled && (
              <label className="provider-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createInGoogle}
                  onChange={(e) => setCreateInGoogle(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span className="provider-icon google" style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '24px', height: '24px', borderRadius: '4px',
                  background: '#4285f4', color: 'white', fontWeight: 'bold', fontSize: '14px'
                }}>G</span>
                <span>Google Workspace</span>
              </label>
            )}
            {microsoftEnabled && (
              <label className="provider-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createInMicrosoft}
                  onChange={(e) => setCreateInMicrosoft(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span className="provider-icon microsoft" style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '24px', height: '24px', borderRadius: '4px',
                  background: '#00a4ef', color: 'white', fontWeight: 'bold', fontSize: '14px'
                }}>M</span>
                <span>Microsoft 365</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* License Assignment - only show when licenses are available and for new users */}
      {!isEditMode && licenses.length > 0 && (
        <div className="form-section">
          <h3 className="section-title">License Assignment</h3>
          <div className="form-group">
            <label>License</label>
            <select
              value={selectedLicenseId}
              onChange={(e) => setSelectedLicenseId(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Select license...</option>
              {licenses.map((lic: any) => (
                <option key={lic.id} value={lic.id}>
                  {lic.displayName} ({lic.provider})
                  {lic.availableUnits >= 0 && ` - ${lic.availableUnits} available`}
                </option>
              ))}
            </select>
            <p className="field-hint">Assign a license to this user for Google Workspace or Microsoft 365</p>
          </div>
        </div>
      )}

      {/* Password Setup Method - only show for new users */}
      {!isEditMode && (
      <div className="form-section">
        <h3 className="section-title">Password Setup</h3>

        <div className="password-method-selector">
          <label className={`method-option ${passwordMethod === 'email_link' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="passwordMethod"
              value="email_link"
              checked={passwordMethod === 'email_link'}
              onChange={(e) => setPasswordMethod(e.target.value as PasswordMethod)}
              disabled={isSubmitting}
            />
            <div className="method-content">
              <div className="method-title"><Mail size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Send password setup email</div>
              <div className="method-description">User receives secure link to set their own password</div>
            </div>
          </label>

          <label className={`method-option ${passwordMethod === 'admin_set' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="passwordMethod"
              value="admin_set"
              checked={passwordMethod === 'admin_set'}
              onChange={(e) => setPasswordMethod(e.target.value as PasswordMethod)}
              disabled={isSubmitting}
            />
            <div className="method-content">
              <div className="method-title"><Key size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> I will set the password</div>
              <div className="method-description">Set password now and share with user</div>
            </div>
          </label>
        </div>

        {passwordMethod === 'email_link' ? (
          <>
            <div className="form-group">
              <label>Alternate Email (for setup link) <span className="required">*</span></label>
              <input
                type="email"
                value={formData.alternateEmail}
                onChange={(e) => handleInputChange('alternateEmail', e.target.value)}
                placeholder="personal@email.com"
                disabled={isSubmitting}
              />
              <p className="field-hint">The setup link will be sent to this email</p>
            </div>
            <div className="form-group">
              <label>Link Expires In</label>
              <select
                value={formData.expiryHours}
                onChange={(e) => handleInputChange('expiryHours', e.target.value)}
                disabled={isSubmitting}
              >
                <option value="24">24 hours</option>
                <option value="48">48 hours (Recommended)</option>
                <option value="72">72 hours</option>
                <option value="168">7 days</option>
              </select>
            </div>
          </>
        ) : (
          <div className="form-group">
            <label>Password <span className="required">*</span></label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              placeholder="Minimum 8 characters"
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>
      )}

      {/* Profile Information */}
      <div className="form-section">
        <h3 className="section-title">Profile Information</h3>

        <div className="form-row">
          <div className="form-group">
            <label>Job Title</label>
            {jobTitles.length > 0 ? (
              <select
                value={formData.jobTitle}
                onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Select job title...</option>
                {jobTitles.filter((jt: any) => jt.isActive !== false).map((jt: any) => (
                  <option key={jt.id} value={jt.name}>{jt.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.jobTitle}
                onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                placeholder="e.g., Program Manager"
                disabled={isSubmitting}
              />
            )}
          </div>
          <div className="form-group">
            <label>Department</label>
            {departments.length > 0 ? (
              <select
                value={formData.department}
                onChange={(e) => handleInputChange('department', e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Select department...</option>
                {departments.filter((dept: any) => dept.isActive !== false).map((dept: any) => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.department}
                onChange={(e) => handleInputChange('department', e.target.value)}
                placeholder="e.g., Engineering"
                disabled={isSubmitting}
              />
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Location</label>
            {locations.length > 0 ? (
              <select
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Select location...</option>
                {locations.filter((loc: any) => loc.isActive !== false).map((loc: any) => (
                  <option key={loc.id} value={loc.name}>{loc.name}{loc.city ? ` (${loc.city})` : ''}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="e.g., Calgary"
                disabled={isSubmitting}
              />
            )}
          </div>
          <div className="form-group">
            <label>Organizational Unit</label>
            <select
              value={formData.organizationalUnit}
              onChange={(e) => handleInputChange('organizationalUnit', e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Select OU...</option>
              <option value="/Engineering">Engineering</option>
              <option value="/Sales">Sales</option>
              <option value="/Marketing">Marketing</option>
              <option value="/HR">HR</option>
            </select>
            <p className="field-hint">Where in your organization structure</p>
          </div>
        </div>

        <div className="form-group">
          <label>Reporting Manager</label>
          <select
            value={formData.reportingManager}
            onChange={(e) => handleInputChange('reportingManager', e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Select manager...</option>
            {managers.filter((mgr: any) => mgr.status === 'active').map((mgr: any) => (
              <option key={mgr.id} value={mgr.id}>
                {mgr.first_name || mgr.firstName} {mgr.last_name || mgr.lastName} ({mgr.email})
              </option>
            ))}
          </select>
          <p className="field-hint">Direct supervisor for this user</p>
        </div>
      </div>

      {/* Contact Information */}
      <div className="form-section">
        <h3 className="section-title">Contact Information</h3>

        <div className="form-row">
          <div className="form-group">
            <label>Mobile Phone</label>
            <input
              type="tel"
              value={formData.mobilePhone}
              onChange={(e) => handleInputChange('mobilePhone', e.target.value)}
              placeholder="(403) 555-1234"
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label>Work Phone</label>
            <input
              type="tel"
              value={formData.workPhone}
              onChange={(e) => handleInputChange('workPhone', e.target.value)}
              placeholder="Extension: 1234"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Secondary Emails */}
        <div className="form-group">
          <label>Secondary Emails</label>
          <div className="multi-input">
            <input
              type="email"
              value={newSecondaryEmail}
              onChange={(e) => setNewSecondaryEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSecondaryEmail())}
              placeholder="additional@email.com"
              disabled={isSubmitting}
            />
            <button type="button" onClick={addSecondaryEmail} disabled={isSubmitting}>
              Add
            </button>
          </div>
          {formData.secondaryEmails.length > 0 && (
            <div className="tag-list">
              {formData.secondaryEmails.map((email, idx) => (
                <span key={idx} className="tag">
                  {email}
                  <button type="button" onClick={() => removeSecondaryEmail(email)} disabled={isSubmitting}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Groups & Access */}
      <div className="form-section">
        <h3 className="section-title">Groups & Access</h3>

        <div className="form-group">
          <label>Groups</label>
          <div className="multi-input">
            <input
              type="text"
              value={searchGroup}
              onChange={(e) => setSearchGroup(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addGroup(searchGroup), setSearchGroup(''))}
              placeholder="Start typing group name..."
              disabled={isSubmitting}
            />
            <button type="button" onClick={() => { addGroup(searchGroup); setSearchGroup(''); }} disabled={isSubmitting}>
              Add
            </button>
          </div>
          <p className="field-hint">Type to search and select groups</p>
          {formData.groups.length > 0 && (
            <div className="tag-list">
              {formData.groups.map((group, idx) => (
                <span key={idx} className="tag">
                  {group}
                  <button type="button" onClick={() => removeGroup(group)} disabled={isSubmitting}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Fields */}
      <div className="form-section">
        <h3 className="section-title">Custom Fields</h3>

        <div className="form-row">
          <div className="form-group">
            <label>GitHub ID</label>
            <input
              type="text"
              value={formData.customFields.githubId}
              onChange={(e) => handleCustomFieldChange('githubId', e.target.value)}
              placeholder="github-username"
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label>Slack ID</label>
            <input
              type="text"
              value={formData.customFields.slackId}
              onChange={(e) => handleCustomFieldChange('slackId', e.target.value)}
              placeholder="U030STKMVQC"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>JumpCloud ID</label>
            <input
              type="text"
              value={formData.customFields.jumpcloudId}
              onChange={(e) => handleCustomFieldChange('jumpcloudId', e.target.value)}
              placeholder="e401064"
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label>Associate ID</label>
            <input
              type="text"
              value={formData.customFields.associateId}
              onChange={(e) => handleCustomFieldChange('associateId', e.target.value)}
              placeholder="0CJHCLIAB"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Employment Type</label>
          <select
            value={formData.customFields.employmentType}
            onChange={(e) => handleCustomFieldChange('employmentType', e.target.value)}
            disabled={isSubmitting}
          >
            <option value="Full Time">Full Time</option>
            <option value="Part Time">Part Time</option>
            <option value="Contract">Contract</option>
            <option value="Intern">Intern</option>
          </select>
        </div>
      </div>

      {/* Form Actions */}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={() => navigate('/admin/users')} disabled={isSubmitting || isLoadingUser}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleSubmitSingle} disabled={isSubmitting || isLoadingUser}>
          {isSubmitting ? (
            <>
              <Loader size={16} className="spin" style={{ marginRight: '6px' }} />
              {isEditMode ? 'Updating User...' : 'Creating User...'}
            </>
          ) : (
            <>
              {isEditMode ? <Save size={16} style={{ marginRight: '6px' }} /> : <Plus size={16} style={{ marginRight: '6px' }} />}
              {isEditMode ? 'Update User' : 'Create User'}
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderBulkMode = () => (
    <div className="bulk-mode">
      <div className="bulk-header">
        <div className="bulk-info">
          <h3>Bulk User Creation</h3>
          <p>Add multiple users at once. Fill in the table below or import from CSV.</p>
        </div>
        <button className="btn-add-row" onClick={addBulkRow}>
          <UserPlus size={16} />
          Add Row
        </button>
      </div>

      {bulkUsers.length === 0 ? (
        <div className="bulk-empty">
          <Users size={48} />
          <p>No users added yet</p>
          <p className="hint">Click "Add Row" to start adding users, or switch to CSV Upload to import from a file.</p>
        </div>
      ) : (
        <>
          <div className="bulk-table-container">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th>Email <span className="required">*</span></th>
                  <th>First Name <span className="required">*</span></th>
                  <th>Last Name <span className="required">*</span></th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Job Title</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bulkUsers.map((user) => (
                  <tr key={user.id} className={user.isValid ? '' : 'invalid-row'}>
                    <td>
                      <input
                        type="email"
                        value={user.email}
                        onChange={(e) => updateBulkRow(user.id, 'email', e.target.value)}
                        placeholder="user@example.com"
                        className={user.errors.some(e => e.includes('email') || e.includes('Email')) ? 'input-error' : ''}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={user.firstName}
                        onChange={(e) => updateBulkRow(user.id, 'firstName', e.target.value)}
                        placeholder="First"
                        className={user.errors.some(e => e.includes('First')) ? 'input-error' : ''}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={user.lastName}
                        onChange={(e) => updateBulkRow(user.id, 'lastName', e.target.value)}
                        placeholder="Last"
                        className={user.errors.some(e => e.includes('Last')) ? 'input-error' : ''}
                      />
                    </td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(e) => updateBulkRow(user.id, 'role', e.target.value)}
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={user.department}
                        onChange={(e) => updateBulkRow(user.id, 'department', e.target.value)}
                        placeholder="Department"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={user.jobTitle}
                        onChange={(e) => updateBulkRow(user.id, 'jobTitle', e.target.value)}
                        placeholder="Job Title"
                      />
                    </td>
                    <td className="status-cell">
                      {user.isValid ? (
                        <span className="status-valid"><CheckCircle size={16} /> Valid</span>
                      ) : (
                        <span className="status-invalid" title={user.errors.join(', ')}>
                          <AlertCircle size={16} /> {user.errors.length} error{user.errors.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-remove-row"
                        onClick={() => removeBulkRow(user.id)}
                        title="Remove row"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bulk Results */}
          {bulkResults && (
            <div className={`bulk-results ${bulkResults.failed > 0 ? 'has-errors' : ''}`}>
              <div className="results-summary">
                <span className="success-count">
                  <CheckCircle size={16} /> {bulkResults.success} created
                </span>
                {bulkResults.failed > 0 && (
                  <span className="failed-count">
                    <X size={16} /> {bulkResults.failed} failed
                  </span>
                )}
              </div>
              {bulkResults.errors.length > 0 && (
                <div className="results-errors">
                  <p>Errors:</p>
                  <ul>
                    {bulkResults.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Summary and Actions */}
          <div className="bulk-summary">
            <div className="summary-stats">
              <span className="total">{bulkUsers.length} total</span>
              <span className="valid">{bulkUsers.filter(u => u.isValid).length} valid</span>
              <span className="invalid">{bulkUsers.filter(u => !u.isValid).length} with errors</span>
            </div>
            <div className="bulk-actions">
              <button
                className="btn-secondary"
                onClick={() => setBulkUsers([])}
                disabled={bulkSubmitting}
              >
                Clear All
              </button>
              <button
                className="btn-primary"
                onClick={handleSubmitBulk}
                disabled={bulkSubmitting || bulkUsers.filter(u => u.isValid).length === 0}
              >
                {bulkSubmitting ? 'Creating Users...' : `Create ${bulkUsers.filter(u => u.isValid).length} User(s)`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderCSVUpload = () => (
    <div className="csv-upload">
      <div className="csv-header">
        <h3>CSV Import</h3>
        <p>Upload a CSV file to import multiple users at once.</p>
      </div>

      <div className="csv-dropzone">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv"
          style={{ display: 'none' }}
        />
        <div
          className="dropzone-content"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={48} />
          <p>Click to upload or drag and drop</p>
          <p className="hint">CSV file with columns: email, firstName, lastName, role, department, jobTitle</p>
        </div>
      </div>

      <div className="csv-template">
        <button className="btn-link" onClick={downloadCSVTemplate}>
          <FileSpreadsheet size={16} />
          Download CSV Template
        </button>
      </div>

      {csvParsing && (
        <div className="csv-status parsing">
          Parsing CSV file...
        </div>
      )}

      {csvError && (
        <div className="csv-status error">
          <AlertCircle size={16} />
          {csvError}
        </div>
      )}

      {csvFile && csvParsedData.length > 0 && (
        <div className="csv-preview">
          <h4>Preview ({csvParsedData.length} users found)</h4>
          <div className="preview-table-container">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {csvParsedData.slice(0, 5).map((user) => (
                  <tr key={user.id} className={user.isValid ? '' : 'invalid-row'}>
                    <td>{user.email}</td>
                    <td>{user.firstName}</td>
                    <td>{user.lastName}</td>
                    <td>{user.role}</td>
                    <td>{user.department || '-'}</td>
                    <td>
                      {user.isValid ? (
                        <span className="status-valid"><CheckCircle size={14} /></span>
                      ) : (
                        <span className="status-invalid" title={user.errors.join(', ')}>
                          <AlertCircle size={14} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvParsedData.length > 5 && (
              <p className="preview-more">...and {csvParsedData.length - 5} more</p>
            )}
          </div>

          <div className="csv-summary">
            <span className="valid">{csvParsedData.filter(u => u.isValid).length} valid</span>
            <span className="invalid">{csvParsedData.filter(u => !u.isValid).length} with errors</span>
          </div>

          <div className="csv-actions">
            <button
              className="btn-secondary"
              onClick={() => {
                setCsvFile(null);
                setCsvParsedData([]);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleImportCSV}
            >
              Import to Bulk Editor
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="add-user-page">
      <div className="page-header">
        <div className="header-content">
          <button className="back-button" onClick={() => navigate('/admin/users')}>
            ← Back to Users
          </button>
          <h1>{isEditMode ? 'Edit User' : 'Add New User'}</h1>
          <p className="page-description">
            {isEditMode ? 'Update user account and profile information' : 'Create user accounts and configure their profile information'}
          </p>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingUser && (
        <div className="message" style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader size={16} className="spin" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
          Loading user data...
        </div>
      )}

      {/* View Mode Tabs */}
      {!isLoadingUser && (
      <>
        <div className="view-mode-tabs">
          <button
            className={`tab ${viewMode === 'single' ? 'active' : ''}`}
            onClick={() => setViewMode('single')}
          >
            <User size={16} /> Single User
          </button>
          <button
            className={`tab ${viewMode === 'bulk' ? 'active' : ''}`}
            onClick={() => setViewMode('bulk')}
          >
            <Users size={16} /> Bulk Mode
          </button>
          <button
            className={`tab ${viewMode === 'csv' ? 'active' : ''}`}
            onClick={() => setViewMode('csv')}
          >
            <FileSpreadsheet size={16} /> CSV Upload
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="message error-message">
            <AlertCircle size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
            {error}
          </div>
        )}
        {success && (
          <div className="message success-message">
            <CheckCircle size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
            {success}
          </div>
        )}

        {/* Content */}
        <div className="page-content">
          {viewMode === 'single' && renderSingleUserForm()}
          {viewMode === 'bulk' && renderBulkMode()}
          {viewMode === 'csv' && renderCSVUpload()}
        </div>
      </>
      )}
    </div>
  );
}

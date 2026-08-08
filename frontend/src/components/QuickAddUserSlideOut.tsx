import { useState, useEffect } from 'react';
import { X, UserPlus, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { authFetch } from '../config/api';
import './QuickAddUserSlideOut.css';

interface QuickAddUserSlideOutProps {
    organizationId?: string;
    onClose: () => void;
    onUserCreated?: () => void;
}

interface FormData {
    // Personal Info
    firstName: string;
    lastName: string;
    // Contact
    email: string;
    alternateEmail: string;
    mobilePhone: string;
    workPhone: string;
    // Work Info
    jobTitle: string;
    department: string;
    managerId: string;
    role: string;
    // Password
    passwordMethod: 'email' | 'manual';
    password: string;
    confirmPassword: string;
    expiresIn: string;
    // Linked Accounts
    createInGoogle: boolean;
    createInMicrosoft: boolean;
    licenseId: string;
}

interface ValidationErrors {
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    confirmPassword?: string;
    alternateEmail?: string;
}

export function QuickAddUserSlideOut({ organizationId: _organizationId, onClose, onUserCreated }: QuickAddUserSlideOutProps) {
    const [formData, setFormData] = useState<FormData>({
        firstName: '',
        lastName: '',
        email: '',
        alternateEmail: '',
        mobilePhone: '',
        workPhone: '',
        jobTitle: '',
        department: '',
        managerId: '',
        role: 'user',
        passwordMethod: 'email',
        password: '',
        confirmPassword: '',
        expiresIn: '7',
        createInGoogle: true,
        createInMicrosoft: false,
        licenseId: '',
    });

    const [errors, setErrors] = useState<ValidationErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Dropdown data
    const [departments, setDepartments] = useState<any[]>([]);
    const [jobTitles, setJobTitles] = useState<any[]>([]);
    const [managers, setManagers] = useState<any[]>([]);
    const [licenses, setLicenses] = useState<any[]>([]);
    const [googleEnabled, setGoogleEnabled] = useState(false);
    const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
    const [orgDomain, setOrgDomain] = useState('');

    useEffect(() => {
        fetchDropdownData();
    }, []);

    const fetchDropdownData = async () => {
        // Fetch all dropdown data in parallel
        const [deptRes, jtRes, mgrRes, licRes, statsRes, orgRes] = await Promise.allSettled([
            authFetch('/api/v1/organization/departments'),
            authFetch('/api/v1/organization/job-titles'),
            authFetch('/api/v1/organization/users?status=active&limit=100'),
            authFetch('/api/v1/organization/licenses'),
            authFetch('/api/v1/dashboard/stats'),
            authFetch('/api/v1/organization/current')
        ]);

        // Process departments
        if (deptRes.status === 'fulfilled' && deptRes.value.ok) {
            const data = await deptRes.value.json();
            if (data.success) setDepartments(data.data || []);
        }

        // Process job titles
        if (jtRes.status === 'fulfilled' && jtRes.value.ok) {
            const data = await jtRes.value.json();
            if (data.success) setJobTitles(data.data || []);
        }

        // Process managers
        if (mgrRes.status === 'fulfilled' && mgrRes.value.ok) {
            const data = await mgrRes.value.json();
            setManagers(data.data || []);
        }

        // Process licenses
        if (licRes.status === 'fulfilled' && licRes.value.ok) {
            const data = await licRes.value.json();
            if (data.success) setLicenses(data.data?.licenses || []);
        }

        // Process integration status
        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
            const data = await statsRes.value.json();
            if (data.success) {
                setGoogleEnabled(data.data?.google?.connected || false);
                setMicrosoftEnabled(data.data?.microsoft?.connected || false);
            }
        }

        // Process org domain
        if (orgRes.status === 'fulfilled' && orgRes.value.ok) {
            const data = await orgRes.value.json();
            if (data.success && data.data?.domain) {
                setOrgDomain(data.data.domain);
            }
        }
    };

    const validateForm = (): boolean => {
        const newErrors: ValidationErrors = {};

        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }

        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }

        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }

        if (formData.passwordMethod === 'manual') {
            if (!formData.password) {
                newErrors.password = 'Password is required';
            } else if (formData.password.length < 8) {
                newErrors.password = 'Password must be at least 8 characters';
            }
            if (formData.password !== formData.confirmPassword) {
                newErrors.confirmPassword = 'Passwords do not match';
            }
        } else {
            if (formData.alternateEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.alternateEmail)) {
                newErrors.alternateEmail = 'Invalid email format';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleInputChange = (field: keyof FormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field as keyof ValidationErrors]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        setIsSubmitting(true);
        setSubmitResult(null);

        try {
            const payload: any = {
                email: formData.email,
                firstName: formData.firstName,
                lastName: formData.lastName,
                role: formData.role,
                userType: 'staff',
                status: 'pending',
            };

            // Add optional fields
            if (formData.jobTitle) payload.jobTitle = formData.jobTitle;
            if (formData.department) payload.department = formData.department;
            if (formData.managerId) payload.reportingManagerId = formData.managerId;
            if (formData.alternateEmail) payload.alternateEmail = formData.alternateEmail;
            if (formData.mobilePhone) payload.mobilePhone = formData.mobilePhone;
            if (formData.workPhone) payload.workPhone = formData.workPhone;

            // Password handling
            if (formData.passwordMethod === 'manual') {
                payload.password = formData.password;
                payload.passwordSetupMethod = 'admin_set';
            } else {
                payload.passwordSetupMethod = 'email_link';
                payload.expiryHours = parseInt(formData.expiresIn) * 24;
            }

            // Provider options
            payload.createInGoogle = formData.createInGoogle && googleEnabled;
            payload.createInMicrosoft = formData.createInMicrosoft && microsoftEnabled;

            // License assignment
            if (formData.licenseId) payload.licenseId = formData.licenseId;

            const response = await authFetch('/api/v1/organization/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Check if there was a partial failure (e.g., GW creation failed)
                const hasGwWarning = data.providerStatus?.google?.requested && !data.providerStatus?.google?.success;
                const hasMsWarning = data.providerStatus?.microsoft?.requested && !data.providerStatus?.microsoft?.success;

                // Use server message which includes provider status details
                let message = data.message || `User ${formData.firstName} ${formData.lastName} created successfully!`;

                // Show as warning (not full success) if provider creation failed
                const isPartialSuccess = hasGwWarning || hasMsWarning;

                setSubmitResult({
                    success: !isPartialSuccess, // false for partial success to show warning styling
                    message: message
                });
                onUserCreated?.();
                setTimeout(() => onClose(), isPartialSuccess ? 4000 : 2000); // Give more time to read warning
            } else {
                setSubmitResult({
                    success: false,
                    message: data.error || 'Failed to create user'
                });
            }
        } catch (error: any) {
            setSubmitResult({
                success: false,
                message: error.message || 'An error occurred'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEmailBlur = () => {
        // Auto-complete domain if user typed just username@
        if (formData.email.endsWith('@') && orgDomain) {
            handleInputChange('email', formData.email + orgDomain);
        }
    };

    return (
        <div className="quick-add-overlay" onClick={onClose}>
            <div className="quick-add-panel" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="quick-add-header">
                    <div className="header-title">
                        <UserPlus size={20} />
                        <h2>Add New User</h2>
                    </div>
                    <button className="close-btn" onClick={onClose} title="Close">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="quick-add-content">
                    {/* Success/Error Message */}
                    {submitResult && (
                        <div className={`result-message ${submitResult.success ? 'success' : 'error'}`}>
                            {submitResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                            <span>{submitResult.message}</span>
                        </div>
                    )}

                    {/* Name Section */}
                    <div className="form-section">
                        <h3>Personal Information</h3>
                        <div className="form-row two-col">
                            <div className="form-group">
                                <label>First Name <span className="required">*</span></label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                                    placeholder="John"
                                    className={errors.firstName ? 'error' : ''}
                                    autoFocus
                                />
                                {errors.firstName && <span className="error-text">{errors.firstName}</span>}
                            </div>
                            <div className="form-group">
                                <label>Last Name <span className="required">*</span></label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                                    placeholder="Doe"
                                    className={errors.lastName ? 'error' : ''}
                                />
                                {errors.lastName && <span className="error-text">{errors.lastName}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Contact Section */}
                    <div className="form-section">
                        <h3>Contact Information</h3>
                        <div className="form-row two-col">
                            <div className="form-group">
                                <label>Work Email <span className="required">*</span></label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                    onBlur={handleEmailBlur}
                                    placeholder={`user@${orgDomain || 'company.com'}`}
                                    className={errors.email ? 'error' : ''}
                                />
                                {errors.email && <span className="error-text">{errors.email}</span>}
                            </div>
                            <div className="form-group">
                                <label>Personal Email</label>
                                <input
                                    type="email"
                                    value={formData.alternateEmail}
                                    onChange={(e) => handleInputChange('alternateEmail', e.target.value)}
                                    placeholder="personal@gmail.com"
                                    className={errors.alternateEmail ? 'error' : ''}
                                />
                                {errors.alternateEmail && <span className="error-text">{errors.alternateEmail}</span>}
                            </div>
                        </div>
                        <div className="form-row two-col">
                            <div className="form-group">
                                <label>Mobile Phone</label>
                                <input
                                    type="tel"
                                    value={formData.mobilePhone}
                                    onChange={(e) => handleInputChange('mobilePhone', e.target.value)}
                                    placeholder="+1 (555) 123-4567"
                                />
                            </div>
                            <div className="form-group">
                                <label>Work Phone</label>
                                <input
                                    type="tel"
                                    value={formData.workPhone}
                                    onChange={(e) => handleInputChange('workPhone', e.target.value)}
                                    placeholder="+1 (555) 987-6543"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Work Information Section */}
                    <div className="form-section">
                        <h3>Work Information</h3>
                        <div className="form-row two-col">
                            <div className="form-group">
                                <label>Job Title</label>
                                <select
                                    value={formData.jobTitle}
                                    onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                                >
                                    <option value="">Select job title...</option>
                                    {jobTitles.filter((jt: any) => jt.isActive !== false).map((jt: any) => (
                                        <option key={jt.id} value={jt.name}>{jt.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Department</label>
                                <select
                                    value={formData.department}
                                    onChange={(e) => handleInputChange('department', e.target.value)}
                                >
                                    <option value="">Select department...</option>
                                    {departments.filter((d: any) => d.isActive !== false).map((d: any) => (
                                        <option key={d.id} value={d.name}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="form-row two-col">
                            <div className="form-group">
                                <label>Reports To</label>
                                <select
                                    value={formData.managerId}
                                    onChange={(e) => handleInputChange('managerId', e.target.value)}
                                >
                                    <option value="">Select manager...</option>
                                    {managers.map((m: any) => (
                                        <option key={m.id} value={m.id}>
                                            {m.firstName || m.first_name} {m.lastName || m.last_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Access Level</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => handleInputChange('role', e.target.value)}
                                >
                                    <option value="user">User</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Linked Accounts Section - Compact */}
                    {(googleEnabled || microsoftEnabled) && (
                        <div className="form-section">
                            <h3>Linked Accounts</h3>
                            <div className="linked-accounts">
                                {googleEnabled && (
                                    <label className="linked-account-option">
                                        <input
                                            type="checkbox"
                                            checked={formData.createInGoogle}
                                            onChange={(e) => handleInputChange('createInGoogle', e.target.checked)}
                                        />
                                        <img src="https://www.google.com/favicon.ico" alt="Google" className="provider-favicon" />
                                        <span>Create in Google Workspace</span>
                                    </label>
                                )}
                                {microsoftEnabled && (
                                    <label className="linked-account-option">
                                        <input
                                            type="checkbox"
                                            checked={formData.createInMicrosoft}
                                            onChange={(e) => handleInputChange('createInMicrosoft', e.target.checked)}
                                        />
                                        <img src="https://www.microsoft.com/favicon.ico" alt="Microsoft" className="provider-favicon" />
                                        <span>Create in Microsoft 365</span>
                                    </label>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Password Setup */}
                    <div className="form-section">
                        <h3>Password Setup</h3>
                        <div className="password-options">
                            <label className="radio-option">
                                <input
                                    type="radio"
                                    name="passwordMethod"
                                    checked={formData.passwordMethod === 'email'}
                                    onChange={() => handleInputChange('passwordMethod', 'email')}
                                />
                                <span>Send password setup link via email</span>
                            </label>
                            <label className="radio-option">
                                <input
                                    type="radio"
                                    name="passwordMethod"
                                    checked={formData.passwordMethod === 'manual'}
                                    onChange={() => handleInputChange('passwordMethod', 'manual')}
                                />
                                <span>Set password now</span>
                            </label>
                        </div>

                        {formData.passwordMethod === 'email' && (
                            <div className="form-row" style={{ marginTop: '1rem' }}>
                                <div className="form-group">
                                    <label>Link Expires In</label>
                                    <select
                                        value={formData.expiresIn}
                                        onChange={(e) => handleInputChange('expiresIn', e.target.value)}
                                        style={{ maxWidth: '200px' }}
                                    >
                                        <option value="1">1 day</option>
                                        <option value="3">3 days</option>
                                        <option value="7">7 days</option>
                                        <option value="14">14 days</option>
                                        <option value="30">30 days</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {formData.passwordMethod === 'manual' && (
                            <div className="form-row two-col" style={{ marginTop: '1rem' }}>
                                <div className="form-group">
                                    <label>Password <span className="required">*</span></label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => handleInputChange('password', e.target.value)}
                                        placeholder="Min 8 characters"
                                        className={errors.password ? 'error' : ''}
                                    />
                                    {errors.password && <span className="error-text">{errors.password}</span>}
                                </div>
                                <div className="form-group">
                                    <label>Confirm Password <span className="required">*</span></label>
                                    <input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                                        placeholder="Confirm password"
                                        className={errors.confirmPassword ? 'error' : ''}
                                    />
                                    {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Advanced Options (Collapsible) */}
                    {licenses.length > 0 && (
                        <div className="form-section">
                            <button
                                className="advanced-toggle"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                            >
                                {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                Advanced Options
                            </button>

                            {showAdvanced && (
                                <div className="advanced-fields">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Assign License</label>
                                            <select
                                                value={formData.licenseId}
                                                onChange={(e) => handleInputChange('licenseId', e.target.value)}
                                            >
                                                <option value="">No license</option>
                                                {licenses.map((lic: any) => (
                                                    <option key={lic.id} value={lic.id}>
                                                        {lic.displayName} ({lic.provider})
                                                        {lic.availableUnits >= 0 && ` - ${lic.availableUnits} available`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="quick-add-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 size={16} className="spinning" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <UserPlus size={16} />
                                Create User
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default QuickAddUserSlideOut;

/**
 * UI Component Library Examples
 *
 * This file contains practical examples of using Helios UI components.
 * Copy and adapt these examples for your features.
 *
 * DO NOT IMPORT THIS FILE IN PRODUCTION CODE.
 * This is for reference and development only.
 */

import { useState } from 'react';
import { Modal, ConfirmDialog, UserSelector, SelectableBlock } from './index';
import {
  Trash2,
  ArrowRightLeft,
  CheckCircle
} from 'lucide-react';

// ============================================
// Example 1: Simple Modal
// ============================================

export function SimpleModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Open Modal
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="User Settings"
        size="medium"
      >
        <p>This is a simple modal with a title and close button.</p>
        <button onClick={() => setIsOpen(false)}>Done</button>
      </Modal>
    </>
  );
}

// ============================================
// Example 2: Confirm Dialog - Delete Action
// ============================================

export function ConfirmDeleteExample() {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = () => {
    console.log('User deleted');
    setShowConfirm(false);
  };

  return (
    <>
      <button onClick={() => setShowConfirm(true)}>
        Delete User
      </button>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

// ============================================
// Example 3: Single User Selection
// ============================================

export function SingleUserSelectionExample() {
  const [selectedUserId, setSelectedUserId] = useState('');
  const organizationId = 'org-123'; // Replace with actual org ID

  return (
    <div style={{ maxWidth: '400px' }}>
      <UserSelector
        label="Assign to User"
        value={selectedUserId}
        onChange={(id) => setSelectedUserId(id as string)}
        organizationId={organizationId}
        placeholder="Search users..."
      />

      {selectedUserId && (
        <p>Selected user ID: {selectedUserId}</p>
      )}
    </div>
  );
}

// ============================================
// Example 4: Multiple User Selection
// ============================================

export function MultipleUserSelectionExample() {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const organizationId = 'org-123';
  const currentUserId = 'user-456';

  return (
    <div style={{ maxWidth: '500px' }}>
      <UserSelector
        label="Add Group Members"
        value={selectedUserIds}
        onChange={(ids) => setSelectedUserIds(ids as string[])}
        organizationId={organizationId}
        multiple={true}
        exclude={[currentUserId]}
        placeholder="Search to add members..."
      />

      <p>Selected {selectedUserIds.length} users</p>
    </div>
  );
}

// ============================================
// Example 5: Selectable Blocks - Delete Options
// ============================================

export function SelectableBlocksExample() {
  const [deleteOption, setDeleteOption] = useState<'permanent' | 'transfer'>('permanent');
  const [transferUserId, setTransferUserId] = useState('');
  const organizationId = 'org-123';
  const userToDeleteId = 'user-789';

  return (
    <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SelectableBlock
        selected={deleteOption === 'permanent'}
        onClick={() => setDeleteOption('permanent')}
        icon={<Trash2 size={20} />}
        title="Permanent Delete"
        description="Immediately remove all user data without recovery"
        badge={{ text: 'Irreversible', variant: 'danger' }}
      />

      <SelectableBlock
        selected={deleteOption === 'transfer'}
        onClick={() => setDeleteOption('transfer')}
        icon={<ArrowRightLeft size={20} />}
        title="Transfer & Delete"
        description="Transfer user's data to another user before deletion"
        badge={{ text: 'Recommended', variant: 'success' }}
      >
        <UserSelector
          label="Transfer to user"
          value={transferUserId}
          onChange={(id) => setTransferUserId(id as string)}
          organizationId={organizationId}
          exclude={[userToDeleteId]}
          placeholder="Select user to receive data..."
        />
      </SelectableBlock>
    </div>
  );
}

// ============================================
// Example 6: Complete Delete User Flow
// ============================================

export function CompleteDeleteUserFlowExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'options' | 'confirm'>('options');
  const [deleteOption, setDeleteOption] = useState<'permanent' | 'transfer'>('permanent');
  const [transferUserId, setTransferUserId] = useState('');

  const organizationId = 'org-123';
  const userToDeleteId = 'user-789';

  const handleNext = () => {
    if (deleteOption === 'transfer' && !transferUserId) {
      alert('Please select a user to transfer data to');
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    console.log('Deleting user with option:', deleteOption);
    if (deleteOption === 'transfer') {
      console.log('Transfer to user:', transferUserId);
    }

    // API call would go here
    // await deleteUser(userToDeleteId, { transferTo: transferUserId });

    // Reset and close
    setIsOpen(false);
    setStep('options');
    setDeleteOption('permanent');
    setTransferUserId('');
  };

  const handleCancel = () => {
    if (step === 'confirm') {
      setStep('options');
    } else {
      setIsOpen(false);
      setStep('options');
      setDeleteOption('permanent');
      setTransferUserId('');
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Delete User
      </button>

      {/* Step 1: Choose delete option */}
      <Modal
        isOpen={isOpen && step === 'options'}
        onClose={handleCancel}
        title="Delete User Options"
        size="medium"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SelectableBlock
            selected={deleteOption === 'permanent'}
            onClick={() => setDeleteOption('permanent')}
            icon={<Trash2 size={20} />}
            title="Permanent Delete"
            description="Immediately remove all user data"
            badge={{ text: 'Irreversible', variant: 'danger' }}
          />

          <SelectableBlock
            selected={deleteOption === 'transfer'}
            onClick={() => setDeleteOption('transfer')}
            icon={<ArrowRightLeft size={20} />}
            title="Transfer & Delete"
            description="Transfer user data before deletion"
            badge={{ text: 'Recommended', variant: 'success' }}
          >
            <UserSelector
              label="Transfer to user"
              value={transferUserId}
              onChange={(id) => setTransferUserId(id as string)}
              organizationId={organizationId}
              exclude={[userToDeleteId]}
            />
          </SelectableBlock>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              className="helios-btn helios-btn-secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              className="helios-btn helios-btn-primary"
              onClick={handleNext}
            >
              Next
            </button>
          </div>
        </div>
      </Modal>

      {/* Step 2: Confirm deletion */}
      <ConfirmDialog
        isOpen={step === 'confirm'}
        title="Confirm Deletion"
        message={`Are you sure you want to delete this user? ${
          deleteOption === 'transfer'
            ? 'Data will be transferred to the selected user.'
            : 'All data will be permanently deleted and cannot be recovered.'
        }`}
        variant="danger"
        confirmText="Delete User"
        cancelText="Go Back"
        onConfirm={handleConfirm}
        onCancel={() => setStep('options')}
      />
    </>
  );
}

// ============================================
// Example 7: Custom Icons in ConfirmDialog
// ============================================

export function CustomIconConfirmExample() {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <button onClick={() => setShowConfirm(true)}>
        Enable Feature
      </button>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Enable Feature"
        message="This will activate the new feature for all users in your organization."
        variant="success"
        icon={<CheckCircle size={20} />}
        confirmText="Enable"
        cancelText="Cancel"
        onConfirm={() => {
          console.log('Feature enabled');
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

// ============================================
// Example 8: Warning Dialog
// ============================================

export function WarningDialogExample() {
  const [showWarning, setShowWarning] = useState(false);

  return (
    <>
      <button onClick={() => setShowWarning(true)}>
        Change Settings
      </button>

      <ConfirmDialog
        isOpen={showWarning}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave without saving?"
        variant="warning"
        confirmText="Leave Anyway"
        cancelText="Stay"
        onConfirm={() => {
          console.log('Leaving without saving');
          setShowWarning(false);
        }}
        onCancel={() => setShowWarning(false)}
      />
    </>
  );
}

// ============================================
// Example 9: Large Modal with Form
// ============================================

export function LargeModalFormExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user',
    assignedTo: ''
  });

  const handleSubmit = () => {
    console.log('Form submitted:', formData);
    setIsOpen(false);
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Add User
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add New User"
        size="large"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="form-input"
              />
            </div>

            <UserSelector
              label="Assign Manager"
              value={formData.assignedTo}
              onChange={(id) => setFormData({ ...formData, assignedTo: id as string })}
              organizationId="org-123"
              placeholder="Select manager..."
            />

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                className="helios-btn helios-btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="helios-btn helios-btn-success"
              >
                Add User
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ============================================
// Example 10: Small Modal for Quick Actions
// ============================================

export function SmallModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Quick Settings
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Quick Settings"
        size="small"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button className="helios-btn helios-btn-secondary" style={{ width: '100%' }}>
            Export Data
          </button>
          <button className="helios-btn helios-btn-secondary" style={{ width: '100%' }}>
            View Logs
          </button>
          <button className="helios-btn helios-btn-danger" style={{ width: '100%' }}>
            Clear Cache
          </button>
        </div>
      </Modal>
    </>
  );
}

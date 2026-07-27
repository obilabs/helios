import * as fs from 'fs';
import * as path from 'path';

// Use static values instead of faker to avoid ESM/CommonJS issues
// faker-js v8+ is ESM-only, which breaks CommonJS imports
const staticData = {
  firstNames: ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Jessica', 'Robert', 'Amanda'],
  lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'],
  departments: ['Engineering', 'Marketing', 'Sales', 'Finance', 'Human Resources', 'Operations', 'Product', 'Design'],
  jobTitles: ['Manager', 'Senior Developer', 'Analyst', 'Coordinator', 'Specialist', 'Director', 'Engineer', 'Lead'],
  roles: ['admin', 'manager', 'user'] as const,
  priorities: ['low', 'normal', 'high', 'urgent'] as const,
  statuses: ['new', 'in_progress', 'pending', 'resolved'] as const,
  sizes: ['1-10', '11-50', '51-200', '201-500', '500+'] as const,
  groupTypes: ['native', 'google_workspace', 'microsoft_365'] as const,
  sentences: [
    'This is a test sentence for data generation.',
    'Another example text for testing purposes.',
    'Sample description for automated tests.',
    'Generated content for the test suite.',
    'Test data placeholder text here.'
  ],
  paragraphs: [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
  ],
  companyNames: ['Acme Corp', 'TechStart Inc', 'GlobalTech', 'Innovation Labs', 'Digital Solutions'],
  buzzPhrases: ['Synergize cloud solutions', 'Leverage digital transformation', 'Optimize workflow efficiency']
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmail(firstName: string, lastName: string): string {
  const num = Math.floor(Math.random() * 1000);
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${num}@test.example.com`;
}

function randomDomain(): string {
  const prefixes = ['test', 'demo', 'sample', 'example'];
  const suffixes = ['io', 'com', 'net', 'org'];
  return `${pick(prefixes)}${Math.floor(Math.random() * 1000)}.${pick(suffixes)}`;
}

function randomPhone(): string {
  return `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
}

function randomAlphanumeric(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomNumeric(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

export class TestDataHelper {
  private fixturesPath: string;
  private tempFiles: string[] = [];

  constructor() {
    this.fixturesPath = path.join(__dirname, '../fixtures');

    // Ensure fixtures directory exists
    if (!fs.existsSync(this.fixturesPath)) {
      fs.mkdirSync(this.fixturesPath, { recursive: true });
    }
  }

  /**
   * Generate random user data
   */
  generateUser(overrides?: any): any {
    const firstName = pick(staticData.firstNames);
    const lastName = pick(staticData.lastNames);
    return {
      email: randomEmail(firstName, lastName),
      firstName,
      lastName,
      password: 'TestPass123!',
      role: pick(staticData.roles),
      department: pick(staticData.departments),
      jobTitle: pick(staticData.jobTitles),
      phone: randomPhone(),
      ...overrides
    };
  }

  /**
   * Generate multiple users
   */
  generateUsers(count: number, overrides?: any): any[] {
    return Array.from({ length: count }, () => this.generateUser(overrides));
  }

  /**
   * Generate CSV content
   */
  generateCSV(data: any[], headers?: string[]): string {
    if (data.length === 0) return '';

    const csvHeaders = headers || Object.keys(data[0]);
    const csvRows = data.map(row =>
      csvHeaders.map(header => {
        const value = row[header] || '';
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );

    return [csvHeaders.join(','), ...csvRows].join('\n');
  }

  /**
   * Create temporary CSV file
   */
  async createCSVFile(filename: string, data: any[], headers?: string[]): Promise<string> {
    const csvContent = this.generateCSV(data, headers);
    const filePath = path.join(this.fixturesPath, 'temp', filename);

    // Ensure temp directory exists
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(filePath, csvContent);
    this.tempFiles.push(filePath);

    console.log(`Created CSV file: ${filename}`);
    return filePath;
  }

  /**
   * Get fixture file path
   */
  getFile(filename: string): string {
    return path.join(this.fixturesPath, filename);
  }

  /**
   * Create sample CSV files
   */
  async createSampleCSVs(): Promise<void> {
    // User import CSV
    const users = this.generateUsers(10);
    await this.createCSVFile('users_import.csv', users, [
      'email', 'firstName', 'lastName', 'password', 'role', 'department'
    ]);

    // User update CSV
    const updates = users.slice(0, 5).map(u => ({
      email: u.email,
      department: pick(staticData.departments),
      jobTitle: pick(staticData.jobTitles)
    }));
    await this.createCSVFile('users_update.csv', updates, [
      'email', 'department', 'jobTitle'
    ]);

    // Invalid CSV (missing required fields)
    const invalid = [
      { email: 'invalid@example.com' }, // Missing required fields
      { firstName: 'John', lastName: 'Doe' } // Missing email
    ];
    await this.createCSVFile('users_invalid.csv', invalid);

    console.log('Sample CSV files created');
  }

  /**
   * Generate organization data
   */
  generateOrganization(overrides?: any): any {
    const companyName = pick(staticData.companyNames);
    const firstName = pick(staticData.firstNames);
    const lastName = pick(staticData.lastNames);
    return {
      name: companyName,
      domain: randomDomain(),
      adminEmail: randomEmail(firstName, lastName),
      adminFirstName: firstName,
      adminLastName: lastName,
      adminPassword: 'AdminTest123!',
      industry: pick(staticData.buzzPhrases),
      size: pick(staticData.sizes),
      ...overrides
    };
  }

  /**
   * Generate group data
   */
  generateGroup(overrides?: any): any {
    const firstName = pick(staticData.firstNames);
    const lastName = pick(staticData.lastNames);
    return {
      name: pick(staticData.departments) + ' Team',
      description: pick(staticData.sentences),
      email: randomEmail(firstName, lastName),
      type: pick(staticData.groupTypes),
      members: [],
      ...overrides
    };
  }

  /**
   * Generate ticket data
   */
  generateTicket(overrides?: any): any {
    const firstName = pick(staticData.firstNames);
    const lastName = pick(staticData.lastNames);
    return {
      subject: pick(staticData.sentences),
      senderEmail: randomEmail(firstName, lastName),
      senderName: `${firstName} ${lastName}`,
      groupEmail: 'support@test.helios.local',
      priority: pick(staticData.priorities),
      status: pick(staticData.statuses),
      content: staticData.paragraphs.join('\n\n'),
      ...overrides
    };
  }

  /**
   * Generate bulk operation data
   */
  generateBulkOperation(type: string, count: number): any {
    switch (type) {
      case 'user_create':
        return this.generateUsers(count);
      case 'user_update':
        return this.generateUsers(count).map(u => ({
          email: u.email,
          department: u.department,
          jobTitle: u.jobTitle
        }));
      case 'user_delete':
        return this.generateUsers(count).map(u => ({ email: u.email }));
      case 'group_create':
        return Array.from({ length: count }, () => this.generateGroup());
      default:
        return [];
    }
  }

  /**
   * Generate test file
   */
  async createTestFile(filename: string, content: string): Promise<string> {
    const filePath = path.join(this.fixturesPath, 'temp', filename);

    // Ensure temp directory exists
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content);
    this.tempFiles.push(filePath);

    console.log(`Created test file: ${filename}`);
    return filePath;
  }

  /**
   * Generate service account JSON
   */
  generateServiceAccountJSON(): any {
    return {
      type: 'service_account',
      project_id: 'test-project-12345',
      private_key_id: randomAlphanumeric(40),
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----',
      client_email: 'test-service-account@test-project-12345.iam.gserviceaccount.com',
      client_id: randomNumeric(21),
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs'
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    for (const file of this.tempFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }

    // Clean temp directory
    const tempDir = path.join(this.fixturesPath, 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    this.tempFiles = [];
    console.log('Temporary files cleaned up');
  }

  /**
   * Wait for condition
   */
  async waitFor(condition: () => boolean | Promise<boolean>, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  /**
   * Generate random delay
   */
  async randomDelay(min: number = 500, max: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

export default TestDataHelper;

import * as fs from 'fs';
import * as path from 'path';

export interface Scenario {
  given: string[];
  when: string[];
  then: string[];
  examples?: any[];
}

export interface SpecRequirement {
  id: string;
  file: string;
  requirement: string;
  description: string;
  scenarios: Scenario[];
}

export class SpecParser {
  private specsDir: string;

  constructor(specsDir: string = path.join(__dirname, '../../../changes')) {
    this.specsDir = specsDir;
  }

  /**
   * Parse all spec files in a change directory
   */
  async parseChange(changeName: string): Promise<SpecRequirement[]> {
    const changePath = path.join(this.specsDir, changeName, 'specs');
    const requirements: SpecRequirement[] = [];

    if (!fs.existsSync(changePath)) {
      console.warn(`No specs found for change: ${changeName}`);
      return requirements;
    }

    const specFiles = fs.readdirSync(changePath)
      .filter(file => file.endsWith('.md'));

    for (const file of specFiles) {
      const filePath = path.join(changePath, file);
      const fileReqs = await this.parseSpecFile(filePath);
      requirements.push(...fileReqs);
    }

    return requirements;
  }

  /**
   * Parse a single spec file
   */
  async parseSpecFile(filePath: string): Promise<SpecRequirement[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const requirements: SpecRequirement[] = [];

    // Parse requirements sections
    const requirementBlocks = content.split(/### Requirement:/);

    for (const block of requirementBlocks.slice(1)) { // Skip first empty split
      const requirement = this.parseRequirementBlock(block, filePath);
      if (requirement) {
        requirements.push(requirement);
      }
    }

    return requirements;
  }

  /**
   * Parse a requirement block into structured data
   */
  private parseRequirementBlock(block: string, filePath: string): SpecRequirement | null {
    const lines = block.trim().split('\n');
    const requirementTitle = lines[0].trim();

    // Generate ID from title
    const id = requirementTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Parse description
    const descStart = lines.findIndex(line => !line.startsWith('#'));
    const descEnd = lines.findIndex(line => line.includes('#### Scenario:'));
    const description = lines.slice(descStart, descEnd > 0 ? descEnd : undefined)
      .join('\n')
      .trim();

    // Parse scenarios
    const scenarios = this.parseScenarios(block);

    if (scenarios.length === 0) {
      return null;
    }

    return {
      id,
      file: path.basename(filePath),
      requirement: requirementTitle,
      description,
      scenarios
    };
  }

  /**
   * Parse scenarios from a requirement block
   */
  private parseScenarios(block: string): Scenario[] {
    const scenarios: Scenario[] = [];
    const scenarioBlocks = block.split(/#### Scenario:/);

    for (const scenarioBlock of scenarioBlocks.slice(1)) {
      const scenario = this.parseScenario(scenarioBlock);
      if (scenario) {
        scenarios.push(scenario);
      }
    }

    return scenarios;
  }

  /**
   * Parse a single scenario
   */
  private parseScenario(block: string): Scenario | null {
    const lines = block.trim().split('\n');
    const scenario: Scenario = {
      given: [],
      when: [],
      then: []
    };

    let currentSection: 'given' | 'when' | 'then' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('- **GIVEN**')) {
        currentSection = 'given';
        const content = trimmed.replace('- **GIVEN**', '').trim();
        if (content) scenario.given.push(content);
      } else if (trimmed.startsWith('- **WHEN**')) {
        currentSection = 'when';
        const content = trimmed.replace('- **WHEN**', '').trim();
        if (content) scenario.when.push(content);
      } else if (trimmed.startsWith('- **THEN**')) {
        currentSection = 'then';
        const content = trimmed.replace('- **THEN**', '').trim();
        if (content) scenario.then.push(content);
      } else if (trimmed.startsWith('- **AND**') && currentSection) {
        const content = trimmed.replace('- **AND**', '').trim();
        if (content) scenario[currentSection].push(content);
      } else if (trimmed.startsWith('-') && currentSection) {
        // Handle bullet points without keywords
        const content = trimmed.substring(1).trim();
        if (content && !content.startsWith('*')) {
          scenario[currentSection].push(content);
        }
      }
    }

    // Only return valid scenarios
    if (scenario.when.length > 0 && scenario.then.length > 0) {
      return scenario;
    }

    return null;
  }

  /**
   * Get all changes with specs
   */
  async getAllChanges(): Promise<string[]> {
    if (!fs.existsSync(this.specsDir)) {
      return [];
    }

    return fs.readdirSync(this.specsDir)
      .filter(dir => {
        const specsPath = path.join(this.specsDir, dir, 'specs');
        return fs.existsSync(specsPath) && fs.statSync(specsPath).isDirectory();
      });
  }

  /**
   * Parse all specs in the project
   */
  async parseAll(): Promise<Map<string, SpecRequirement[]>> {
    const allSpecs = new Map<string, SpecRequirement[]>();
    const changes = await this.getAllChanges();

    for (const change of changes) {
      const requirements = await this.parseChange(change);
      if (requirements.length > 0) {
        allSpecs.set(change, requirements);
      }
    }

    return allSpecs;
  }
}

// Export for use in test generation
export default SpecParser;
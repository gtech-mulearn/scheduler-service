import {
  getGritWarningTemplate,
  getLevelDownTemplate,
} from './grit-meter-email.templates';

describe('GritMeterEmailTemplates', () => {
  describe('getGritWarningTemplate', () => {
    it('should generate valid 50% grit warning template', () => {
      const template = getGritWarningTemplate({
        firstName: 'Alex',
        grit: 50,
        levelOrder: 5,
        levelName: 'Level 5 (Advanced)',
      });

      expect(template.subject).toContain('Level 5');
      expect(template.html).toContain('Alex');
      expect(template.html).toContain('50%');
      expect(template.text).toContain('50%');
    });

    it('should show critical badge for grit <= 5', () => {
      const template = getGritWarningTemplate({
        firstName: 'Sarah',
        grit: 3,
        levelOrder: 6,
        levelName: 'Level 6 (Expert)',
      });

      expect(template.subject).toContain('Urgent');
      expect(template.html).toContain('CRITICAL');
      expect(template.html).toContain('3 Day');
    });
  });

  describe('getLevelDownTemplate', () => {
    it('should generate valid level-down template', () => {
      const template = getLevelDownTemplate({
        firstName: 'John',
        previousLevelOrder: 5,
        newLevelOrder: 4,
        newLevelName: 'Level 4 (Proficient)',
      });

      expect(template.subject).toContain('Leveled Down to Level 4');
      expect(template.html).toContain('Level 5');
      expect(template.html).toContain('Level 4 (Proficient)');
      expect(template.html).toContain('John');
      expect(template.text).toContain('Grit Meter has been reset to 100%');
    });
  });
});

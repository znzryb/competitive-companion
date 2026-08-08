import { Sendable } from '../../models/Sendable';
import { TaskBuilder } from '../../models/TaskBuilder';
import { htmlToElement } from '../../utils/dom';
import { Parser } from '../Parser';

export class ShortestPathOJProblemParser extends Parser {
  public getMatchPatterns(): string[] {
    return [
      'https://shortestpath.cn/mirrors/*',
      'https://shortestpath.cn/replay/*',
      'https://shortestpath.cn/topics/*',
    ];
  }

  /**
   * The site is a single page application which keeps the selected problem in the url's hash.
   * When no problem is selected the statement is not rendered at all, in which case the
   * contest parser should be used instead.
   */
  public canHandlePage(): boolean {
    return hasStatement(document.documentElement);
  }

  public async parse(url: string, html: string): Promise<Sendable> {
    const elem = htmlToElement(html);
    const task = new TaskBuilder('Shortest Path OJ').setUrl(url);

    if (!hasStatement(elem)) {
      throw new Error('Could not find a problem statement, make sure a problem is selected.');
    }

    const title = elem.querySelector('h1').textContent.trim();
    const label = url.includes('#') ? decodeURIComponent(url.split('#').pop()) : '';
    task.setName(/^[A-Z][A-Z0-9]?$/i.test(label) ? `${label}. ${title}` : title);

    // The document title is kept in sync with the contest's name
    if (/\/(mirrors|replay)\//.test(url)) {
      const documentTitle = elem.querySelector('title');
      if (documentTitle !== null && documentTitle.textContent.trim().length > 0) {
        task.setCategory(documentTitle.textContent.trim());
      }
    }

    for (const span of elem.querySelectorAll('span')) {
      const timeLimit = span.textContent.match(/^时限\s*([0-9.]+)\s*ms$/);
      if (timeLimit !== null) {
        task.setTimeLimit(parseFloat(timeLimit[1]));
      }

      const memoryLimit = span.textContent.match(/^内存\s*([0-9.]+)\s*MB$/);
      if (memoryLimit !== null) {
        task.setMemoryLimit(parseFloat(memoryLimit[1]));
      }
    }

    // The statement's markdown may contain code blocks using the same class as the sample blocks,
    // so samples are found by looking for the labels which are rendered above them instead
    let input: string | null = null;
    for (const block of elem.querySelectorAll('pre.code-plain-text')) {
      const blockLabel = block.previousElementSibling?.querySelector('span')?.textContent?.trim();

      if (blockLabel === '输入') {
        input = getSampleContent(block);
      } else if (blockLabel === '输出' && input !== null) {
        task.addTest(input, getSampleContent(block));
        input = null;
      }
    }

    return task.build();
  }
}

function hasStatement(root: Element): boolean {
  if (root.querySelector('h1') === null) {
    return false;
  }

  return [...root.querySelectorAll('span')].some(span => /^时限\s*[0-9.]+\s*ms$/.test(span.textContent));
}

/**
 * Empty samples are rendered with a placeholder rather than with no content at all.
 */
function getSampleContent(block: Element): string {
  const content = block.textContent;
  return content === '（空）' ? '' : content;
}

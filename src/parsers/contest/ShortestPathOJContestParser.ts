import { Task } from '../../models/Task';
import { TaskBuilder } from '../../models/TaskBuilder';
import { request } from '../../utils/request';
import { ContestParser } from '../ContestParser';

interface ContestProblem {
  label: string;
  title?: string;
  time_limit_ms?: number;
  memory_limit_mb?: number;
  samples?: string | Sample[];
}

interface Sample {
  input?: string;
  output?: string;
}

interface TaskToParse {
  contestUrl: string;
  contestId: string;
  contestTitle: string;
  label: string;
}

export class ShortestPathOJContestParser extends ContestParser<TaskToParse> {
  public getMatchPatterns(): string[] {
    return ['https://shortestpath.cn/mirrors/*', 'https://shortestpath.cn/replay/*'];
  }

  protected async getTasksToParse(html: string, url: string): Promise<TaskToParse[]> {
    const contestUrl = url.split('#')[0].replace(/\/$/, '');
    const contestId = contestUrl.split('/').pop();

    const overview = await requestApi(`/api/contests/${encodeURIComponent(contestId)}`);
    const problems: ContestProblem[] = overview.problems ?? [];

    return problems.map(problem => ({
      contestUrl,
      contestId,
      contestTitle: overview.contest?.title ?? '',
      label: problem.label,
    }));
  }

  protected async parseTask(input: TaskToParse): Promise<Task> {
    const data = await requestApi(
      `/api/contests/${encodeURIComponent(input.contestId)}/problems/${encodeURIComponent(input.label)}`,
    );

    const problem: ContestProblem = data.problem;
    const task = new TaskBuilder('Shortest Path OJ').setUrl(`${input.contestUrl}#${input.label}`);

    task.setName(`${problem.label}. ${problem.title}`);
    task.setCategory(input.contestTitle);

    if (typeof problem.time_limit_ms === 'number') {
      task.setTimeLimit(problem.time_limit_ms);
    }

    if (typeof problem.memory_limit_mb === 'number') {
      task.setMemoryLimit(problem.memory_limit_mb);
    }

    // The site trims samples before rendering them, so do the same to stay consistent with the problem parser
    for (const sample of parseSamples(problem.samples)) {
      task.addTest((sample.input ?? '').trim(), (sample.output ?? '').trim());
    }

    return task.build();
  }
}

/**
 * Samples are usually stored as a json-encoded array, but problems which were imported without
 * machine-readable samples store them as markdown with the samples in fenced code blocks instead.
 */
function parseSamples(samples: string | Sample[] | undefined): Sample[] {
  if (Array.isArray(samples)) {
    return samples;
  }

  if (typeof samples !== 'string') {
    return [];
  }

  const content = samples.replace(/\r\n/g, '\n').trim();
  if (content.length === 0) {
    return [];
  }

  if (content.startsWith('[') || content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      return Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      // Fall through to the markdown format
    }
  }

  return parseMarkdownSamples(content);
}

function parseMarkdownSamples(content: string): Sample[] {
  // Every sample is its own section, unless the samples are not split up into sections at all
  const sections = content.split(/(?:^|\n)#### [^\n]*\n/).filter(section => section.trim().length > 0);

  return sections
    .map(section => {
      const blocks = [...section.matchAll(/```[^\n]*\n([\s\S]*?)\n```/g)].map(match => match[1].trim());

      return {
        input: matchLabeledBlock(section, ['输入', 'Input']) || blocks[0] || '',
        output: matchLabeledBlock(section, ['输出', 'Output']) || blocks[1] || '',
      };
    })
    .filter(sample => sample.input.length > 0 || sample.output.length > 0);
}

function matchLabeledBlock(section: string, labels: string[]): string {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${labels.join('|')})\\s*[：:]\\s*\\n?\`\`\`[^\\n]*\\n([\\s\\S]*?)\\n\`\`\``,
    'i',
  );

  return section.match(pattern)?.[1]?.trim() ?? '';
}

async function requestApi(path: string): Promise<any> {
  const body = await request(`https://shortestpath.cn${path}`, {
    headers: { Accept: 'application/json' },
  });

  const response = JSON.parse(body);
  if (response.code !== 0) {
    throw new Error(`The API returned an error for ${path}: ${response.message ?? 'unknown error'}.`);
  }

  return response.data;
}

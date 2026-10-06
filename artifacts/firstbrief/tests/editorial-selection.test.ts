import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorialSelection, frontPageStories } from '../src/editorialSelection';
import type { Cluster, TopicId } from '../src/stories';
const now = Date.parse('2026-10-05T12:00:00Z');
function story(id: string, topic: TopicId, headline: string, summary: string, age: number): Cluster {
  return { id, topic, label: topic, headline, rundown: summary, rundownP2: '', sentiment: [], articles: [{
    source: 'The Guardian', time: '', summary, detail: summary, href: `https://www.theguardian.com/${id}`,
    accessLevel: 'excerpt', publishedAt: new Date(now - age * 3600000).toISOString(),
  }] };
}
test('significant recent news outranks routine newer football and opening is balanced and stable', () => {
  const items = [
    story('match', 'football', 'Arsenal match report: as it happened', 'Match minutes and a routine victory.', 0),
    story('energy', 'nuclear', 'Government approves national electricity grid investment', 'The national grid investment policy supplies millions of households.', 16),
    story('ai', 'ai', 'OpenAI launches new model', 'New chatbot tools for research.', 4),
    story('opinion', 'ai', 'AI crisis will change everything | Columnist', 'An opinion on future technology.', 1),
  ];
  const result = editorialSelection(items);
  assert.equal(result[0].id, 'energy');
  assert.equal(new Set(result.slice(0, 3).map(item => item.topic)).size, 3);
  assert.deepEqual(editorialSelection([...items].reverse()).map(item => item.id), result.map(item => item.id));
  assert.equal(items[0].id, 'match');
});
test('front page has six unique balanced stories; topic input stays full; sparse feeds have no filler', () => {
  const items = (['ai', 'nuclear', 'football'] as const).flatMap(topic => Array.from({ length: 12 }, (_, index) => story(`${topic}-${index}`, topic, 'Article update', 'Publisher source.', index)));
  const featured = frontPageStories(editorialSelection(items));
  assert.equal(featured.length, 6);
  assert.equal(new Set(featured.map(item => item.id)).size, 6);
  assert.equal(new Set(featured.slice(0, 3).map(item => item.topic)).size, 3);
  for (const topic of ['ai', 'nuclear', 'football']) assert.equal(items.filter(item => item.topic === topic).length, 12);
  assert.equal(frontPageStories([]).length, 0);
  assert.equal(frontPageStories(items.slice(0, 2)).length, 2);
});
test('a major football governance development can lead; sensational opinion alone does not', () => {
  const items = [
    story('football', 'football', 'League approves national financial rules reform', 'The league governance decision reforms financial rules for the whole industry.', 1),
    story('ai', 'ai', 'OpenAI model update', 'Small new chatbot tool features.', 0),
    story('energy', 'nuclear', 'Solar panels installed', 'A local power project.', 2),
    story('hype', 'ai', 'AI bombshell catastrophe | Columnist', 'Speculation only.', 0),
  ];
  assert.equal(editorialSelection(items)[0].id, 'football');
});

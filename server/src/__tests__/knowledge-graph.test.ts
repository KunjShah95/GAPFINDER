import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

vi.mock('../db/client.js', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { userId: 'user-1', email: 'test@test.com', role: 'user', tier: 'pro' };
    next();
  }),
}));

import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import router from '../routes/knowledge-graph.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/knowledge-graph', router);
  return app;
}

function mockQueryOnce(result: any) {
  (query as unknown as Mock).mockResolvedValueOnce(result);
}

function mockTransactionSuccess() {
  (transaction as unknown as Mock).mockImplementation(async (fn: any) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    return fn(client);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// GET /api/knowledge-graph/nodes
// ============================================================================

describe('GET /api/knowledge-graph/nodes', () => {
  it('returns nodes with pagination', async () => {
    mockQueryOnce({ rows: [{ total: '2' }] });
    mockQueryOnce({
      rows: [
        { id: 'n1', node_type: 'paper', label: 'Paper A', connection_count: '3' },
        { id: 'n2', node_type: 'gap', label: 'Gap B', connection_count: '1' },
      ],
    });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes');

    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(2);
    expect(res.body.pagination).toEqual({ limit: 50, offset: 0, total: 2 });
  });

  it('filters by node type', async () => {
    mockQueryOnce({ rows: [{ total: '1' }] });
    mockQueryOnce({ rows: [{ id: 'n1', node_type: 'paper', label: 'X', connection_count: '0' }] });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes?type=paper');

    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(1);
  });

  it('filters by search query', async () => {
    mockQueryOnce({ rows: [{ total: '0' }] });
    mockQueryOnce({ rows: [] });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes?search=transformer');

    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(0);
  });

  it('caps limit at 200', async () => {
    mockQueryOnce({ rows: [{ total: '0' }] });
    mockQueryOnce({ rows: [] });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes?limit=500');

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(200);
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp()).get('/api/knowledge-graph/nodes');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch nodes');
  });
});

// ============================================================================
// POST /api/knowledge-graph/nodes
// ============================================================================

describe('POST /api/knowledge-graph/nodes', () => {
  it('creates a node and returns 201', async () => {
    mockQueryOnce({ rows: [{ id: 'n1', node_type: 'paper', label: 'Test Paper', properties: {} }] });

    const res = await request(createApp())
      .post('/api/knowledge-graph/nodes')
      .send({ type: 'paper', name: 'Test Paper' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('n1');
    expect(res.body.label).toBe('Test Paper');
  });

  it('rejects invalid node type', async () => {
    const res = await request(createApp())
      .post('/api/knowledge-graph/nodes')
      .send({ type: 'invalid', name: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects empty name', async () => {
    const res = await request(createApp())
      .post('/api/knowledge-graph/nodes')
      .send({ type: 'paper', name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp())
      .post('/api/knowledge-graph/nodes')
      .send({ type: 'paper', name: 'Test' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create node');
  });
});

// ============================================================================
// GET /api/knowledge-graph/nodes/:id
// ============================================================================

describe('GET /api/knowledge-graph/nodes/:id', () => {
  it('returns node with connected edges', async () => {
    mockQueryOnce({ rows: [{ id: 'n1', node_type: 'paper', label: 'P' }] });
    mockQueryOnce({
      rows: [
        { id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'cites', source_label: 'P', target_label: 'Q' },
      ],
    });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes/n1');

    expect(res.status).toBe(200);
    expect(res.body.node.id).toBe('n1');
    expect(res.body.edges).toHaveLength(1);
  });

  it('returns 404 when node not found', async () => {
    mockQueryOnce({ rows: [] });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Node not found');
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp()).get('/api/knowledge-graph/nodes/n1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch node');
  });
});

// ============================================================================
// DELETE /api/knowledge-graph/nodes/:id
// ============================================================================

describe('DELETE /api/knowledge-graph/nodes/:id', () => {
  it('deletes node and returns success', async () => {
    mockTransactionSuccess();

    const res = await request(createApp()).delete('/api/knowledge-graph/nodes/n1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Node deleted');
  });

  it('returns 404 when node not found', async () => {
    (transaction as unknown as Mock).mockImplementation(async (fn: any) => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
      };
      return fn(client);
    });

    const res = await request(createApp()).delete('/api/knowledge-graph/nodes/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Node not found');
  });

  it('returns 500 on database error', async () => {
    (transaction as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp()).delete('/api/knowledge-graph/nodes/n1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete node');
  });
});

// ============================================================================
// GET /api/knowledge-graph/edges
// ============================================================================

describe('GET /api/knowledge-graph/edges', () => {
  it('returns edges with pagination', async () => {
    mockQueryOnce({ rows: [{ total: '3' }] });
    mockQueryOnce({
      rows: [
        { id: 'e1', edge_type: 'cites', source_id: 'n1', target_id: 'n2' },
        { id: 'e2', edge_type: 'uses', source_id: 'n3', target_id: 'n4' },
        { id: 'e3', edge_type: 'extends', source_id: 'n5', target_id: 'n6' },
      ],
    });

    const res = await request(createApp()).get('/api/knowledge-graph/edges');

    expect(res.status).toBe(200);
    expect(res.body.edges).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('filters by sourceId', async () => {
    mockQueryOnce({ rows: [{ total: '1' }] });
    mockQueryOnce({ rows: [{ id: 'e1', edge_type: 'cites' }] });

    const res = await request(createApp()).get('/api/knowledge-graph/edges?sourceId=n1');

    expect(res.status).toBe(200);
    expect(res.body.edges).toHaveLength(1);
  });

  it('filters by edge type', async () => {
    mockQueryOnce({ rows: [{ total: '0' }] });
    mockQueryOnce({ rows: [] });

    const res = await request(createApp()).get('/api/knowledge-graph/edges?type=contradicts');

    expect(res.status).toBe(200);
    expect(res.body.edges).toHaveLength(0);
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp()).get('/api/knowledge-graph/edges');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch edges');
  });
});

// ============================================================================
// POST /api/knowledge-graph/edges
// ============================================================================

describe('POST /api/knowledge-graph/edges', () => {
  it('creates an edge and returns 201', async () => {
    mockQueryOnce({
      rows: [
        { id: 'n1', label: 'A', node_type: 'paper' },
        { id: 'n2', label: 'B', node_type: 'gap' },
      ],
    });
    mockQueryOnce({ rows: [{ id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'cites', weight: 0.8 }] });

    const res = await request(createApp())
      .post('/api/knowledge-graph/edges')
      .send({ sourceId: 'n1', targetId: 'n2', type: 'cites', weight: 0.8 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('e1');
    expect(res.body.weight).toBe(0.8);
  });

  it('rejects invalid edge type', async () => {
    const res = await request(createApp())
      .post('/api/knowledge-graph/edges')
      .send({ sourceId: 'n1', targetId: 'n2', type: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects self-loop edges', async () => {
    mockQueryOnce({
      rows: [{ id: 'n1', label: 'A', node_type: 'paper' }],
    });

    const res = await request(createApp())
      .post('/api/knowledge-graph/edges')
      .send({ sourceId: 'n1', targetId: 'n1', type: 'cites' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot create edge from node to itself');
  });

  it('returns 404 when one or both nodes missing', async () => {
    mockQueryOnce({ rows: [{ id: 'n1', label: 'A', node_type: 'paper' }] });

    const res = await request(createApp())
      .post('/api/knowledge-graph/edges')
      .send({ sourceId: 'n1', targetId: 'n2', type: 'cites' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('One or both nodes not found');
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp())
      .post('/api/knowledge-graph/edges')
      .send({ sourceId: 'n1', targetId: 'n2', type: 'cites' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create edge');
  });
});

// ============================================================================
// DELETE /api/knowledge-graph/edges/:id
// ============================================================================

describe('DELETE /api/knowledge-graph/edges/:id', () => {
  it('deletes edge and returns success', async () => {
    mockQueryOnce({ rows: [{ id: 'e1' }], rowCount: 1 });

    const res = await request(createApp()).delete('/api/knowledge-graph/edges/e1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Edge deleted');
  });

  it('returns 404 when edge not found', async () => {
    mockQueryOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp()).delete('/api/knowledge-graph/edges/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Edge not found');
  });
});

// ============================================================================
// GET /api/knowledge-graph/subgraph
// ============================================================================

describe('GET /api/knowledge-graph/subgraph', () => {
  it('returns BFS subgraph around a node', async () => {
    mockQueryOnce({ rows: [{ id: 'n1' }] });
    mockQueryOnce({
      rows: [
        { id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'cites', source_label: 'A', target_label: 'B', source_type: 'paper', target_type: 'gap' },
      ],
    });
    mockQueryOnce({ rows: [] });
    mockQueryOnce({
      rows: [
        { id: 'n1', label: 'A', node_type: 'paper', connection_count: '1' },
        { id: 'n2', label: 'B', node_type: 'gap', connection_count: '1' },
      ],
    });

    const res = await request(createApp()).get('/api/knowledge-graph/subgraph?nodeId=n1&depth=2');

    expect(res.status).toBe(200);
    expect(res.body.centerNodeId).toBe('n1');
    expect(res.body.depth).toBe(2);
    expect(res.body.nodes).toHaveLength(2);
    expect(res.body.edges).toHaveLength(1);
  });

  it('returns 400 when nodeId is missing', async () => {
    const res = await request(createApp()).get('/api/knowledge-graph/subgraph');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('nodeId query parameter is required');
  });

  it('returns 404 when center node not found', async () => {
    mockQueryOnce({ rows: [] });

    const res = await request(createApp()).get('/api/knowledge-graph/subgraph?nodeId=missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Node not found');
  });

  it('caps depth at 4', async () => {
    mockQueryOnce({ rows: [{ id: 'n1' }] });
    mockQueryOnce({ rows: [] });
    mockQueryOnce({
      rows: [{ id: 'n1', label: 'A', node_type: 'paper', connection_count: '0' }],
    });

    const res = await request(createApp()).get('/api/knowledge-graph/subgraph?nodeId=n1&depth=99');

    expect(res.status).toBe(200);
    expect(res.body.depth).toBe(4);
  });

  it('deduplicates edges across hops', async () => {
    mockQueryOnce({ rows: [{ id: 'n1' }] });
    mockQueryOnce({
      rows: [
        { id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'cites', source_label: 'A', target_label: 'B', source_type: 'paper', target_type: 'gap' },
      ],
    });
    mockQueryOnce({
      rows: [
        { id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'cites', source_label: 'A', target_label: 'B', source_type: 'paper', target_type: 'gap' },
      ],
    });
    mockQueryOnce({
      rows: [
        { id: 'n1', label: 'A', node_type: 'paper', connection_count: '1' },
        { id: 'n2', label: 'B', node_type: 'gap', connection_count: '1' },
      ],
    });

    const res = await request(createApp()).get('/api/knowledge-graph/subgraph?nodeId=n1&depth=2');

    expect(res.status).toBe(200);
    expect(res.body.edges).toHaveLength(1);
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp()).get('/api/knowledge-graph/subgraph?nodeId=n1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch subgraph');
  });
});

// ============================================================================
// POST /api/knowledge-graph/auto-build
// ============================================================================

describe('POST /api/knowledge-graph/auto-build', () => {
  it('builds graph from papers and gaps', async () => {
    (transaction as unknown as Mock).mockImplementation(async (fn: any) => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })   // papers
          .mockResolvedValueOnce({ rows: [] })    // check existing paper nodes
          .mockResolvedValueOnce({ rows: [{ id: 'pn1' }] }) // insert paper node
          .mockResolvedValueOnce({ rows: [] })    // gaps
          .mockResolvedValueOnce({ rows: [] })    // check existing gap nodes
          .mockResolvedValueOnce({ rows: [{ id: 'gn1' }] }) // insert gap node
          .mockResolvedValueOnce({ rows: [] })    // insert addresses edge
          .mockResolvedValueOnce({ rows: [] })    // concept extraction
          .mockResolvedValueOnce({ rows: [] })    // author extraction
      };
      return fn(client);
    });

    const res = await request(createApp())
      .post('/api/knowledge-graph/auto-build')
      .send({ createConceptNodes: false, createAuthorNodes: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Knowledge graph built successfully');
    expect(res.body.stats).toHaveProperty('nodesCreated');
    expect(res.body.stats).toHaveProperty('edgesCreated');
  });

  it('rejects invalid options', async () => {
    const res = await request(createApp())
      .post('/api/knowledge-graph/auto-build')
      .send({ maxConcepts: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 500 on database error', async () => {
    (transaction as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp())
      .post('/api/knowledge-graph/auto-build')
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to auto-build knowledge graph');
  });
});

// ============================================================================
// GET /api/knowledge-graph/stats
// ============================================================================

describe('GET /api/knowledge-graph/stats', () => {
  it('returns graph statistics', async () => {
    (query as unknown as Mock)
      .mockResolvedValueOnce({ rows: [{ node_type: 'paper', count: '5' }, { node_type: 'gap', count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ edge_type: 'cites', count: '8' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'n1', label: 'Top Node', node_type: 'paper', connection_count: '10' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_nodes: '8', total_edges: '8' }] });

    const res = await request(createApp()).get('/api/knowledge-graph/stats');

    expect(res.status).toBe(200);
    expect(res.body.totalNodes).toBe(8);
    expect(res.body.totalEdges).toBe(8);
    expect(res.body.nodesByType).toEqual({ paper: 5, gap: 3 });
    expect(res.body.edgesByType).toEqual({ cites: 8 });
    expect(res.body.mostConnected).toHaveLength(1);
    expect(typeof res.body.density).toBe('number');
  });

  it('returns density 0 for single-node graph', async () => {
    (query as unknown as Mock)
      .mockResolvedValueOnce({ rows: [{ node_type: 'paper', count: '1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'n1', label: 'Solo', node_type: 'paper', connection_count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total_nodes: '1', total_edges: '0' }] });

    const res = await request(createApp()).get('/api/knowledge-graph/stats');

    expect(res.status).toBe(200);
    expect(res.body.density).toBe(0);
  });

  it('returns 500 on database error', async () => {
    (query as unknown as Mock).mockRejectedValue(new Error('DB fail'));

    const res = await request(createApp()).get('/api/knowledge-graph/stats');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch graph stats');
  });
});

// ============================================================================
// Auth guard
// ============================================================================

describe('Authentication', () => {
  it('rejects requests without auth', async () => {
    (requireAuth as unknown as Mock).mockImplementation((req: Request, res: Response, _next: NextFunction) => {
      res.status(401).json({ error: 'Authentication required' });
    });

    const res = await request(createApp()).get('/api/knowledge-graph/nodes');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});

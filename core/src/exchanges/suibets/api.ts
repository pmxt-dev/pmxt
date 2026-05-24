/**
 * SuiBets P2P Sports Betting API — Inline OpenAPI spec
 * Endpoint: GET /api/p2p/offers, GET /api/p2p/offers/:id
 */
export const suibetsApiSpec = {
    openapi: '3.0.3',
    info: { title: 'SuiBets P2P API', version: '1.0.0' },
    servers: [{ url: 'https://suibets.replit.app' }],
    paths: {
        '/api/p2p/offers': {
            get: {
                summary: 'List P2P Offers',
                operationId: 'getOffers',
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', default: 'OPEN' } },
                    { name: 'matchId', in: 'query', schema: { type: 'string' } },
                    { name: 'sport', in: 'query', schema: { type: 'string' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { '200': { description: 'List of P2P offers' } },
            },
        },
        '/api/p2p/offers/{id}': {
            get: {
                summary: 'Get P2P Offer',
                operationId: 'getOffer',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'Single P2P offer' } },
            },
        },
        '/api/p2p/my': {
            get: {
                summary: 'Get user P2P activity',
                operationId: 'getMyOffers',
                parameters: [{ name: 'wallet', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'User activity' } },
            },
        },
        '/api/events/upcoming': {
            get: {
                summary: 'List upcoming sports events',
                operationId: 'getUpcomingEvents',
                parameters: [
                    { name: 'sport', in: 'query', schema: { type: 'string' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                ],
                responses: { '200': { description: 'Upcoming events' } },
            },
        },
    },
} as const;

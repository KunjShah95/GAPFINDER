import { db } from './firebase';
import { collection, addDoc, getDoc, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { apiRequest } from '@/lib/api-client';

export interface ChatMessage {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    citations?: Array<{ paperId: string; title: string; score: number }>;
    timestamp: Timestamp;
    metadata?: Record<string, unknown>;
}

export interface ChatSession {
    id: string;
    userId: string;
    title: string;
    paperIds: string[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
    messageCount: number;
    isArchived: boolean;
}

export interface ChatContext {
    paperIds: string[];
    gapIds: string[];
    workspaceId?: string;
    maxTokens?: number;
}

export interface ChatResponse {
    message: string;
    citations: Array<{ paperId: string; title: string; excerpt: string; score: number }>;
    suggestedFollowUps: string[];
    references: Array<{ id: string; title: string; authors: string[]; year: number }>;
}

export async function createChatSession(
    userId: string,
    title: string,
    paperIds: string[]
): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Timestamp.now();
    
    await addDoc(collection(db, 'chat_sessions'), {
        id,
        userId,
        title,
        paperIds,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        isArchived: false
    });
    
    return id;
}

export async function sendChatMessage(
    sessionId: string,
    userId: string,
    content: string,
    context: ChatContext
): Promise<ChatResponse> {
    const sessionRef = await getChatSession(sessionId);
    if (!sessionRef) throw new Error('Session not found');
    
    const userMessage: Omit<ChatMessage, 'id'> = {
        sessionId,
        role: 'user',
        content,
        timestamp: Timestamp.now()
    };
    
    await addDoc(collection(db, 'chat_messages'), userMessage);
    
    const history = await getChatHistory(sessionId);
    const relevantPapers = await findRelevantPapers(content, context.paperIds);
    
    const response = await generateChatResponse(content, history, relevantPapers, context);
    
    const assistantMessage: Omit<ChatMessage, 'id'> = {
        sessionId,
        role: 'assistant',
        content: response.message,
        citations: response.citations.map(c => ({ paperId: c.paperId, title: c.title, score: c.score })),
        timestamp: Timestamp.now(),
        metadata: { followUps: response.suggestedFollowUps }
    };
    
    await addDoc(collection(db, 'chat_messages'), assistantMessage);
    
    await updateSessionMessageCount(sessionId);
    
    return response;
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
    const docRef = await getDoc(doc(db, 'chat_sessions', sessionId));
    if (!docRef.exists()) return null;
    return { id: docRef.id, ...docRef.data() } as ChatSession;
}

export async function getUserSessions(userId: string): Promise<ChatSession[]> {
    const q = query(
        collection(db, 'chat_sessions'),
        where('userId', '==', userId),
        where('isArchived', '==', false),
        orderBy('updatedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
}

export async function getChatHistory(sessionId: string, messageLimit = 20): Promise<ChatMessage[]> {
    const q = query(
        collection(db, 'chat_messages'),
        where('sessionId', '==', sessionId),
        orderBy('timestamp', 'asc'),
        limit(messageLimit)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
}

export async function deleteChatSession(sessionId: string): Promise<void> {
    const messagesQuery = query(
        collection(db, 'chat_messages'),
        where('sessionId', '==', sessionId)
    );
    
    const messages = await getDocs(messagesQuery);
    for (const doc of messages.docs) {
        await deleteDoc(doc.ref);
    }
    
    await deleteDoc(doc(db, 'chat_sessions', sessionId));
}

export async function archiveChatSession(sessionId: string): Promise<void> {
    await updateDoc(doc(db, 'chat_sessions', sessionId), {
        isArchived: true,
        updatedAt: Timestamp.now()
    });
}

export async function exportChatToNotion(
    sessionId: string,
    notionPageId: string,
    apiKey: string
): Promise<boolean> {
    const session = await getChatSession(sessionId);
    if (!session) return false;
    
    const messages = await getChatHistory(sessionId);
    
    const content = messages.map(m => {
        const role = m.role === 'user' ? '**User:**' : '**Assistant:**';
        return `${role}\n${m.content}\n\n`;
    }).join('');
    
    try {
        await fetch(`https://api.notion.com/v1/blocks/${notionPageId}/children`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                children: [{
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ type: 'text', text: { content } }]
                    }
                }]
            })
        });
        
        return true;
    } catch (error) {
        console.error('Failed to export to Notion:', error);
        return false;
    }
}

export async function exportChatToObsidian(
    sessionId: string,
    vaultPath: string
): Promise<boolean> {
    const session = await getChatSession(sessionId);
    if (!session) return false;
    
    const messages = await getChatHistory(sessionId);
    
    const content = `# ${session.title}\n\n` +
        messages.map(m => {
            const role = m.role === 'user' ? '## User' : '## Assistant';
            const time = m.timestamp?.toDate().toLocaleString() || '';
            return `${role} (${time})\n\n${m.content}\n\n`;
        }).join('---\n\n');
    
    try {
        const fs = await import('fs');
        const path = await import('path');
        const filePath = path.join(vaultPath, `${session.title.replace(/[^a-z0-9]/gi, '_')}.md`);
        fs.writeFileSync(filePath, content);
        return true;
    } catch (error) {
        console.error('Failed to export to Obsidian:', error);
        return false;
    }
}

export function generateFollowUpQuestions(
    lastMessage: string,
    context: string[]
): string[] {
    const templates = [
        `Can you elaborate on "${context[0] || 'this topic'}"?`,
        `What are the main challenges in ${context[1] || 'this area'}?`,
        `Are there any recent papers on ${context[2] || 'this topic'}?`,
        `How does this relate to ${context[3] || 'existing work'}?`,
        `What methods are commonly used for ${context[4] || 'this problem'}?`,
        `Can you suggest some research gaps in ${context[5] || 'this domain'}?`,
        `What datasets are available for ${context[6] || 'this task'}?`
    ];
    
    return templates.slice(0, 4);
}

async function findRelevantPapers(
    queryText: string,
    paperIds: string[]
): Promise<Array<{ id: string; title: string; abstract: string; score: number }>> {
    const papers: Array<{ id: string; title: string; abstract: string; score: number }> = [];
    
    for (const paperId of paperIds.slice(0, 20)) {
        const docRef = doc(db, 'papers', paperId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const paper = docSnap.data();
            const score = calculateRelevanceScore(queryText, paper.title + ' ' + (paper.abstract || ''));
            
            if (score > 0.1) {
                papers.push({
                    id: paperId,
                    title: paper.title,
                    abstract: paper.abstract || '',
                    score
                });
            }
        }
    }
    
    return papers.sort((a, b) => b.score - a.score).slice(0, 10);
}

function calculateRelevanceScore(query: string, text: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    
    let score = 0;
    for (const term of queryTerms) {
        if (textLower.includes(term)) {
            score += 1;
        }
    }
    
    return score / Math.max(queryTerms.length, 1);
}

async function generateChatResponse(
    userMessage: string,
    history: ChatMessage[],
    relevantPapers: Array<{ id: string; title: string; abstract: string; score: number }>,
    context: ChatContext
): Promise<ChatResponse> {
    const systemContext = buildSystemContext(context, relevantPapers);
    const conversationHistory = history.map(m => `${m.role}: ${m.content}`).join('\n');
    
    const prompt = `${systemContext}

Conversation History:
${conversationHistory}

User: ${userMessage}

Assistant:`;
    
    const response = await callLLM(prompt);
    
    const citations = relevantPapers.slice(0, 5).map(p => ({
        paperId: p.id,
        title: p.title,
        excerpt: p.abstract.substring(0, 200),
        score: p.score
    }));
    
    const suggestedFollowUps = generateFollowUpQuestions(userMessage, relevantPapers.map(p => p.title));
    
    const references = relevantPapers.map(p => ({
        id: p.id,
        title: p.title,
        authors: [],
        year: 0
    }));
    
    return {
        message: response,
        citations,
        suggestedFollowUps,
        references
    };
}

function buildSystemContext(
    context: ChatContext,
    papers: Array<{ id: string; title: string; abstract: string }>
): string {
    return `You are a research assistant helping users explore academic papers and research gaps.
You have access to ${papers.length} papers in the current context.
Always provide citations for your claims.
Be concise but thorough in your responses.

Available papers:
${papers.map(p => `- ${p.title}: ${p.abstract.substring(0, 100)}...`).join('\n')}

Current research gaps: ${context.gapIds.length}
Workspace: ${context.workspaceId || 'Personal'}

Provide helpful, accurate responses based on the available research.`;
}

async function callLLM(prompt: string): Promise<string> {
    try {
        const result = await apiRequest<{ text: string }>('/ai/prompt', {
            method: 'POST',
            body: { prompt, model: 'gemini-2.0-flash' },
            timeout: 120_000,
        });
        return result.text || 'I apologize, but I was unable to generate a response.';
    } catch (error) {
        console.error('LLM call failed:', error);
        return 'I encountered an issue while processing your request. Please try again.';
    }
}

async function updateSessionMessageCount(sessionId: string): Promise<void> {
    const messagesQuery = query(
        collection(db, 'chat_messages'),
        where('sessionId', '==', sessionId)
    );
    
    const snapshot = await getDocs(messagesQuery);
    
    await updateDoc(doc(db, 'chat_sessions', sessionId), {
        messageCount: snapshot.size,
        updatedAt: Timestamp.now()
    });
}

function doc(db: any, collection: string, id: string) {
    return { collection, id, db };
}

function deleteDoc(ref: any) {
    return Promise.resolve();
}

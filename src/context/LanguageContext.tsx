import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Language = 'en' | 'zh' | 'ja' | 'de' | 'fr' | 'es' | 'ko' | 'pt' | 'ru';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    supportedLanguages: { code: Language; name: string }[];
}

const supportedLanguages: { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文 (Chinese)' },
    { code: 'ja', name: '日本語 (Japanese)' },
    { code: 'de', name: 'Deutsch (German)' },
    { code: 'fr', name: 'Français (French)' },
    { code: 'es', name: 'Español (Spanish)' },
    { code: 'ko', name: '한국어 (Korean)' },
    { code: 'pt', name: 'Português (Portuguese)' },
    { code: 'ru', name: 'Русский (Russian)' },
];

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        // Load saved language preference
        const saved = localStorage.getItem('gapminer-language');
        if (saved && supportedLanguages.some(l => l.code === saved)) {
            setLanguageState(saved as Language);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('gapminer-language', lang);
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, supportedLanguages }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}

// Helper to get language display name
export function getLanguageName(code: string): string {
    const lang = supportedLanguages.find(l => l.code === code);
    return lang?.name || code;
}

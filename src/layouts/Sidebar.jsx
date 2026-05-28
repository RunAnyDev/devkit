import React, { useState, useMemo, useEffect } from 'react';
import { Terminal, Search, ChevronDown, ChevronRight, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * Navigation item configuration
 */
const NavItem = ({ item }) => (
    <NavLink
        to={`/${item.id}`}
        className={({ isActive }) => `w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isActive
            ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
    >
        <item.icon size={18} />
        <span className="text-sm font-medium">{item.label}</span>
    </NavLink>
);

/**
 * Sidebar navigation component
 * @param {Object} props
 * @param {Array} props.menuGroups - Grouped navigation items
 */
const Sidebar = ({ menuGroups }) => {
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({});

    // Auto-expand group containing the active tool
    useEffect(() => {
        const currentId = location.pathname.substring(1);
        if (!currentId) return;

        const activeGroup = menuGroups.find(group =>
            group.items.some(item => item.id === currentId)
        );

        if (activeGroup) {
            setExpandedGroups(prev => ({
                ...prev,
                [activeGroup.label]: true
            }));
        }
    }, [location.pathname, menuGroups]);

    // Filter and group items based on search query
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return menuGroups;

        const query = searchQuery.toLowerCase();
        return menuGroups
            .map(group => ({
                ...group,
                items: group.items.filter(item =>
                    item.label.toLowerCase().includes(query) ||
                    item.id.toLowerCase().includes(query) ||
                    (item.keywords && item.keywords.some(kw => kw.toLowerCase().includes(query)))
                )
            }))
            .filter(group => group.items.length > 0);
    }, [menuGroups, searchQuery]);

    // Handle group toggle
    const toggleGroup = (label) => {
        setExpandedGroups(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

    // Auto-expand groups when searching
    const isExpanded = (label) => {
        if (searchQuery.trim()) return true;
        return !!expandedGroups[label];
    };

    return (
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
            {/* Logo */}
            <div className="p-4 border-b border-slate-800 flex items-center gap-2 text-blue-400">
                <Terminal size={24} />
                <span className="font-bold text-lg tracking-tight text-slate-100">
                    Dev<span className="text-blue-500">Kit</span>
                </span>
            </div>

            {/* Search Box */}
            <div className="p-3">
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder="Search tools..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
                {filteredGroups.length > 0 ? (
                    filteredGroups.map((group) => {
                        const expanded = isExpanded(group.label);
                        return (
                            <div key={group.label} className="space-y-1">
                                <button
                                    onClick={() => toggleGroup(group.label)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors group"
                                >
                                    <span>{group.label}</span>
                                    {expanded ? (
                                        <ChevronDown size={12} className="text-slate-600 group-hover:text-slate-400" />
                                    ) : (
                                        <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400" />
                                    )}
                                </button>
                                {expanded && (
                                    <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                        {group.items.map((item) => (
                                            <NavItem key={item.id} item={item} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                        <Search size={32} className="text-slate-700 mb-2" />
                        <p className="text-xs text-slate-500">No tools found for "{searchQuery}"</p>
                    </div>
                )}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center flex items-center justify-center gap-2">
                <span>v1.4.1</span>
                <a href="https://github.com/meesudzu/devkit" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-slate-500 hover:text-slate-300 transition-colors">
                    <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                </a>
            </div>
        </div>
    );
};

export default Sidebar;

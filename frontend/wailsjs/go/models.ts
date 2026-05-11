export namespace main {
	
	export class SkillMetadataPatch {
	    hidden?: boolean;
	    frozen?: boolean;
	    origin?: string;
	
	    static createFrom(source: any = {}) {
	        return new SkillMetadataPatch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hidden = source["hidden"];
	        this.frozen = source["frozen"];
	        this.origin = source["origin"];
	    }
	}

}

export namespace models {
	
	export class AppSettings {
	    sharedRoot?: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sharedRoot = source["sharedRoot"];
	    }
	}
	export class CliSkillEntry {
	    toolName: string;
	    skillName: string;
	    path: string;
	    kind: string;
	    isLink: boolean;
	    linkTarget?: string;
	    hasSkillMd: boolean;
	    sharedRootPath?: string;
	
	    static createFrom(source: any = {}) {
	        return new CliSkillEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.toolName = source["toolName"];
	        this.skillName = source["skillName"];
	        this.path = source["path"];
	        this.kind = source["kind"];
	        this.isLink = source["isLink"];
	        this.linkTarget = source["linkTarget"];
	        this.hasSkillMd = source["hasSkillMd"];
	        this.sharedRootPath = source["sharedRootPath"];
	    }
	}
	export class GitStatus {
	    gitAvailable: boolean;
	    isRepo: boolean;
	    hasRemote: boolean;
	    remotes: string[];
	    dirty: boolean;
	    branch?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new GitStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gitAvailable = source["gitAvailable"];
	        this.isRepo = source["isRepo"];
	        this.hasRemote = source["hasRemote"];
	        this.remotes = source["remotes"];
	        this.dirty = source["dirty"];
	        this.branch = source["branch"];
	        this.error = source["error"];
	    }
	}
	export class LogEntry {
	    timestamp: string;
	    action: string;
	    result: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.action = source["action"];
	        this.result = source["result"];
	        this.message = source["message"];
	    }
	}
	export class SkillInfo {
	    name: string;
	    description: string;
	    path: string;
	    valid: boolean;
	    errors: string[];
	    frontmatter: Record<string, string>;
	    bodyPreview: string;
	    origin: string;
	    hidden: boolean;
	    frozen: boolean;
	    importedFrom?: string;
	    importedAtUnix?: number;
	
	    static createFrom(source: any = {}) {
	        return new SkillInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.path = source["path"];
	        this.valid = source["valid"];
	        this.errors = source["errors"];
	        this.frontmatter = source["frontmatter"];
	        this.bodyPreview = source["bodyPreview"];
	        this.origin = source["origin"];
	        this.hidden = source["hidden"];
	        this.frozen = source["frozen"];
	        this.importedFrom = source["importedFrom"];
	        this.importedAtUnix = source["importedAtUnix"];
	    }
	}
	export class SyncStatus {
	    targetName: string;
	    targetPath: string;
	    state: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new SyncStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetName = source["targetName"];
	        this.targetPath = source["targetPath"];
	        this.state = source["state"];
	        this.message = source["message"];
	    }
	}
	export class ToolStatus {
	    toolName: string;
	    executablePath?: string;
	    detected: boolean;
	    supported: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ToolStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.toolName = source["toolName"];
	        this.executablePath = source["executablePath"];
	        this.detected = source["detected"];
	        this.supported = source["supported"];
	    }
	}

}

export namespace registry {
	
	export class Entry {
	    origin?: string;
	    hidden?: boolean;
	    frozen?: boolean;
	    importedFrom?: string;
	    importedAtUnix?: number;
	
	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.origin = source["origin"];
	        this.hidden = source["hidden"];
	        this.frozen = source["frozen"];
	        this.importedFrom = source["importedFrom"];
	        this.importedAtUnix = source["importedAtUnix"];
	    }
	}
	export class Registry {
	    version: number;
	    skills: Record<string, Entry>;
	
	    static createFrom(source: any = {}) {
	        return new Registry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.skills = this.convertValues(source["skills"], Entry, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}


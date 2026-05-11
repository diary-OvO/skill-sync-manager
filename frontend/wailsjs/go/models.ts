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


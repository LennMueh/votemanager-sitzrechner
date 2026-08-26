const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Ein gemeinsamer Starttakt plus höchstens zwei laufende Abrufe je Host. */
export class Drossel {
	private letzterStart = 0;
	private globaleKette = Promise.resolve();
	private laufend = new Map<string, number>();
	private wartend = new Map<string, Array<() => void>>();
	private proSekunde: number;
	private proHost: number;
	private schlafen: (ms: number) => Promise<void>;
	private jetzt: () => number;

	constructor(
		proSekunde = 20,
		proHost = 2,
		schlafen: (ms: number) => Promise<void> = pause,
		jetzt: () => number = Date.now
	) {
		this.proSekunde = proSekunde;
		this.proHost = proHost;
		this.schlafen = schlafen;
		this.jetzt = jetzt;
	}

	async ausfuehren<T>(url: string, arbeit: () => Promise<T>): Promise<T> {
		const host = new URL(url).host;
		await this.hostNehmen(host);
		try {
			await this.globalNehmen();
			return await arbeit();
		} finally {
			this.hostFreigeben(host);
		}
	}

	private async globalNehmen(): Promise<void> {
		const vorher = this.globaleKette;
		let fertig!: () => void;
		this.globaleKette = new Promise<void>((resolve) => (fertig = resolve));
		await vorher;
		const warten = Math.max(0, this.letzterStart + 1000 / this.proSekunde - this.jetzt());
		if (warten) await this.schlafen(warten);
		this.letzterStart = this.jetzt();
		fertig();
	}

	private async hostNehmen(host: string): Promise<void> {
		if ((this.laufend.get(host) ?? 0) >= this.proHost)
			await new Promise<void>((resolve) => this.wartend.set(host, [...(this.wartend.get(host) ?? []), resolve]));
		this.laufend.set(host, (this.laufend.get(host) ?? 0) + 1);
	}

	private hostFreigeben(host: string): void {
		this.laufend.set(host, (this.laufend.get(host) ?? 1) - 1);
		this.wartend.get(host)?.shift()?.();
	}
}

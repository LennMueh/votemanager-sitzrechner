<script lang="ts">
	// Kurzer Text in einem runden Rahmen: „Direktwahl", „42 Sitze".
	//
	// Die Varianten dürfen nie das einzige Signal sein — der Aufrufer stellt
	// den Wortlaut, das Zeichen und den title. Die Form ist die Zugabe.
	let {
		geschaetzt = false,
		fehlt = false,
		children,
		...rest
	}: {
		/** Gestrichelt: die Zahl ist nicht amtlich bestätigt. */
		geschaetzt?: boolean;
		/** Warnfläche: die Zahl fehlt ganz. */
		fehlt?: boolean;
		children: import('svelte').Snippet;
		[k: string]: unknown;
	} = $props();
</script>

<span class="pille" class:geschaetzt class:fehlt {...rest}>{@render children()}</span>

<style>
	.pille {
		border: 1px solid var(--rand);
		border-radius: var(--radius-pille);
		padding: 0 0.5rem;
		white-space: nowrap;
	}

	.pille.geschaetzt {
		border-style: dashed;
	}

	.pille.fehlt {
		color: var(--warn);
		background: var(--warn-flaeche);
		border-color: transparent;
	}
</style>

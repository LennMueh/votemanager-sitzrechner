<script lang="ts">
	// Der Zurück-Link stand in vier Seiten zeichengleich. Die 44px sind die
	// Touch-Zielgröße und der Grund, warum die Regel überhaupt eine ist.
	let { href, children } = $props();
</script>

<a class="zurueck" {href}>{@render children()}</a>

<style>
	.zurueck {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-bottom: 1.25rem;
		text-decoration: none;
		font-size: var(--schrift-m);
	}
</style>

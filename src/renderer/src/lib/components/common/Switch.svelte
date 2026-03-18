<script lang="ts">
  let {
    checked = false,
    label = '',
    onchange
  }: { checked: boolean; label?: string; onchange?: (value: boolean) => void } = $props()
</script>

<button
  class="w-9 h-5 rounded-full transition-colors {checked
    ? 'bg-black/30 dark:bg-white/30'
    : 'bg-black/[0.10] dark:bg-white/[0.08]'} border-none relative"
  aria-label={label}
  onclick={() => {
    checked = !checked
    onchange?.(checked)
  }}
>
  <div
    class="w-3.5 h-3.5 rounded-full bg-white shadow-sm absolute top-[2.5px] transition-all {checked
      ? 'left-[15px]'
      : 'left-[3px]'}"
  ></div>
</button>

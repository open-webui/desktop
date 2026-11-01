<script lang="ts">
  let {
    checked = false,
    label = '',
    onchange
  }: { checked: boolean; label?: string; onchange?: (value: boolean) => void } = $props()
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  class="relative h-[16px] w-[28px] shrink-0 rounded-full border-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 {checked
    ? 'bg-gray-900 dark:bg-white'
    : 'bg-gray-300 dark:bg-gray-700'}"
  onclick={() => {
    checked = !checked
    onchange?.(checked)
  }}
>
  <span
    class="pointer-events-none absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all {checked
      ? 'left-[14px] bg-white dark:bg-black'
      : 'left-[2px] bg-white dark:bg-gray-500'}"
  ></span>
</button>

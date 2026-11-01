<script lang="ts">
  let {
    checked = false,
    label = '',
    disabled = false,
    onchange
  }: { checked: boolean; label?: string; disabled?: boolean; onchange?: (value: boolean) => void } = $props()
</script>

<button
  type="button"
  {disabled}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  class="relative h-[16px] w-[28px] shrink-0 rounded-full border-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 {checked
    ? 'bg-[oklch(0.2_0_0)] dark:bg-white'
    : 'bg-[oklch(0.85_0_0)] dark:bg-[oklch(0.42_0_0)]'}"
  onclick={() => {
    checked = !checked
    onchange?.(checked)
  }}
>
  <span
    class="pointer-events-none absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all duration-150 {checked
      ? 'left-[14px] bg-white dark:bg-black'
      : 'left-[2px] bg-white dark:bg-[oklch(0.69_0_0)]'}"
  ></span>
</button>

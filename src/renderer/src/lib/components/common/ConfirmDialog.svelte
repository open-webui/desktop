<script lang="ts">
    import DOMPurify from "dompurify";

    import { onMount, onDestroy, tick } from "svelte";
    import * as FocusTrap from "focus-trap";

    import { fade } from "svelte/transition";
    import { flyAndScale } from "../../utils/transitions";
    import { marked } from "marked";

    let {
        title,
        message,
        cancelLabel = "Cancel",
        confirmLabel = "Confirm",
        onConfirm = () => {},
        input,
        inputPlaceholder,
        inputValue,
        show = $bindable(false),
    } = $props();

    $effect(() => {
        if (show) {
            init();
        }
    });

    $effect(() => {
        if (mounted) {
            if (show && modalElement) {
                document.body.appendChild(modalElement);
                focusTrap = FocusTrap.createFocusTrap(modalElement);
                focusTrap.activate();

                window.addEventListener("keydown", handleKeyDown);
                document.body.style.overflow = "hidden";
            } else if (modalElement) {
                focusTrap.deactivate();

                window.removeEventListener("keydown", handleKeyDown);
                document.body.removeChild(modalElement);

                document.body.style.overflow = "unset";
            }
        }
    });

    let modalElement = null;
    let mounted = false;

    let focusTrap: FocusTrap.FocusTrap | null = null;

    const init = () => {
        inputValue = "";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            console.log("Escape");
            show = false;
        }

        if (event.key === "Enter") {
            console.log("Enter");
            confirmHandler();
        }
    };

    const confirmHandler = async () => {
        show = false;
        await tick();
        await onConfirm();
    };

    onMount(() => {
        mounted = true;
    });

    onDestroy(() => {
        show = false;
        if (focusTrap) {
            focusTrap.deactivate();
        }
        if (modalElement) {
            document.body.removeChild(modalElement);
        }
    });
</script>

{#if show}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        bind:this={modalElement}
        class=" fixed top-0 right-0 left-0 bottom-0 bg-black/60 w-full h-screen max-h-[100dvh] flex justify-center z-99999999 overflow-hidden overscroll-contain"
        in:fade={{ duration: 10 }}
        on:mousedown={() => {
            show = false;
        }}
    >
        <div
            class=" m-auto rounded-2xl max-w-full w-[32rem] mx-2 bg-gray-50 dark:bg-gray-950 max-h-[100dvh] shadow-3xl"
            in:flyAndScale
            on:mousedown={(e) => {
                e.stopPropagation();
            }}
        >
            <div class="px-[1.75rem] py-6 flex flex-col">
                <div class=" text-lg font-semibold dark:text-gray-200 mb-2.5">
                    {#if title !== ""}
                        {title}
                    {:else}
                        {"Confirm your action"}
                    {/if}
                </div>

                <slot>
                    <div class=" text-sm text-gray-500 flex-1">
                        {#if message !== ""}
                            {@const html = DOMPurify.sanitize(
                                marked.parse(message)
                            )}
                            {@html html}
                        {:else}
                            {"This action cannot be undone. Do you wish to continue?"}
                        {/if}

                        {#if input}
                            <textarea
                                bind:value={inputValue}
                                placeholder={inputPlaceholder
                                    ? inputPlaceholder
                                    : "Enter your message"}
                                class="w-full mt-2 rounded-lg px-4 py-2 text-sm dark:text-gray-300 dark:bg-gray-900 outline-hidden resize-none"
                                rows="3"
                                required
                            />
                        {/if}
                    </div>
                </slot>

                <div class="mt-6 flex justify-between gap-1.5">
                    <button
                        class="bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white font-medium w-full py-2.5 rounded-lg transition"
                        on:click={() => {
                            show = false;
                        }}
                        type="button"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        class="bg-gray-900 hover:bg-gray-850 text-gray-100 dark:bg-gray-100 dark:hover:bg-white dark:text-gray-800 font-medium w-full py-2.5 rounded-lg transition"
                        on:click={() => {
                            confirmHandler();
                        }}
                        type="button"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-content {
        animation: scaleUp 0.1s ease-out forwards;
    }

    @keyframes scaleUp {
        from {
            transform: scale(0.985);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }
</style>

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Mic, MicOff, Compass, Volume2, VolumeX, Telescope } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppNav";
import { useSky } from "@/lib/sky-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Vega — assistant d'observation astronomique" },
      {
        name: "description",
        content:
          "Posez vos questions à la voix ou au clavier : Vega sait où pointe votre téléphone et vous oriente vers les planètes, galaxies et nébuleuses visibles maintenant.",
      },
      { property: "og:title", content: "Vega — assistant d'observation astronomique" },
      {
        property: "og:description",
        content:
          "Un guide d'astronomie conversationnel qui connaît votre position, l'heure et la direction de votre téléphone.",
      },
    ],
  }),
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Que puis-je observer aux jumelles ce soir ?",
  "Où se trouve Saturne par rapport à moi ?",
  "Qu'est-ce que je vise là, maintenant ?",
  "Quels événements astronomiques arrivent bientôt ?",
];

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function AssistantPage() {
  const { location, date } = useSky();
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [compassOn, setCompassOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const spokenRef = useRef<string | null>(null);

  const ctxRef = useRef({ location, date, heading, pitch });
  ctxRef.current = { location, date, heading, pitch };

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: m }) => ({
        body: {
          messages: m,
          context: {
            latitude: ctxRef.current.location.latitude,
            longitude: ctxRef.current.location.longitude,
            locationName: ctxRef.current.location.name,
            dateISO: ctxRef.current.date.toISOString(),
            heading: ctxRef.current.heading,
            pitch: ctxRef.current.pitch,
          },
        },
      }),
    }),
    onError: (e) => toast.error(e.message || "L'assistant est indisponible"),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  // Boussole
  const enableCompass = useCallback(async () => {
    if (compassOn) {
      setCompassOn(false);
      setHeading(null);
      setPitch(null);
      return;
    }
    const anyOrientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof anyOrientation?.requestPermission === "function") {
      try {
        const res = await anyOrientation.requestPermission();
        if (res !== "granted") {
          toast.error("Accès à la boussole refusé");
          return;
        }
      } catch {
        toast.error("Boussole indisponible sur cet appareil");
        return;
      }
    }
    setCompassOn(true);
  }, [compassOn]);

  useEffect(() => {
    if (!compassOn) return;
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const h = e.webkitCompassHeading ?? (e.alpha !== null ? 360 - e.alpha : null);
      if (h !== null && Number.isFinite(h)) setHeading((h + 360) % 360);
      if (e.beta !== null) setPitch(Math.max(-90, Math.min(90, 90 - Math.abs(e.beta))));
    };
    window.addEventListener("deviceorientationabsolute", handler as EventListener);
    window.addEventListener("deviceorientation", handler as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener);
      window.removeEventListener("deviceorientation", handler as EventListener);
    };
  }, [compassOn]);

  // Dictée vocale
  const toggleMic = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as SpeechRecognitionWindow;
    const SR = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SR) {
      toast.error("La dictée vocale n'est pas supportée par ce navigateur");
      return;
    }
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev) => {
      let text = "";
      for (let i = 0; i < ev.results.length; i++) {
        const transcript = ev.results[i]?.[0]?.transcript;
        if (transcript) text += transcript;
      }
      setInput(text);
    };
    rec.onerror = () => {
      setListening(false);
      toast.error("Micro inaccessible");
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  // Synthèse vocale des réponses
  useEffect(() => {
    if (!speak || busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
    if (!text || spokenRef.current === last.id) return;
    spokenRef.current = last.id;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [messages, speak, busy]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    void sendMessage({ text: value });
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      <PageHeader
        title="Vega, votre guide d'observation"
        subtitle="Parlez-lui ou écrivez : il connaît votre position, l'heure et la direction de votre téléphone."
      />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6">
        <div className="flex flex-wrap items-center gap-2 py-3">
          <Badge variant="outline">{location.name}</Badge>
          <Badge variant="outline" suppressHydrationWarning>
            {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </Badge>
          <Button size="sm" variant={compassOn ? "default" : "outline"} onClick={enableCompass}>
            <Compass className="size-4" />
            {compassOn
              ? heading === null
                ? "Boussole…"
                : `${Math.round(heading)}°`
              : "Activer la boussole"}
          </Button>
          <Button
            size="sm"
            variant={speak ? "default" : "outline"}
            onClick={() => {
              setSpeak((v) => !v);
              if (speak) window.speechSynthesis.cancel();
            }}
          >
            {speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            Lecture vocale
          </Button>
        </div>

        <Conversation className="min-h-[45vh] flex-1 rounded-xl border border-border/60 bg-card/30">
          <ConversationContent>
            {!messages.length && (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Telescope className="size-7 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Bonsoir, je suis Vega.</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Demandez-moi où pointer votre instrument, ce qui est visible maintenant, ou ce
                    que vous êtes en train de viser.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => submit(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.parts.map((part, i) =>
                    part.type === "text" ? (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))}

            {status === "submitted" && (
              <Shimmer className="px-2 text-sm">Vega consulte le ciel…</Shimmer>
            )}
            {error && (
              <p className="px-2 text-sm text-destructive">
                {error.message || "Une erreur est survenue."}
              </p>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput
          className="mt-3"
          onSubmit={(_, e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Je vous écoute…" : "Posez votre question sur le ciel…"}
          />
          <PromptInputFooter className="justify-end gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant={listening ? "default" : "ghost"}
              onClick={toggleMic}
              aria-label="Dictée vocale"
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <PromptInputSubmit status={status} disabled={!input.trim() || busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  );
}

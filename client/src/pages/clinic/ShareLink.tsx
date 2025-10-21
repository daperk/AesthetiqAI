import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ClinicNav from "@/components/ClinicNav";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Copy, Download, ExternalLink, Share2, QrCode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Location } from "@shared/schema";

export default function ShareLink() {
  const { organization, isLoading } = useOrganization();
  const { toast } = useToast();
  const [qrSize, setQrSize] = useState(256);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: !!organization?.id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const selectedLocation = locations?.find(loc => loc.id === selectedLocationId) || locations?.[0];
  const bookingUrl = selectedLocation 
    ? `${window.location.origin}/c/${selectedLocation.slug}`
    : `${window.location.origin}/c/${organization?.slug}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast({
        title: "Link copied!",
        description: "Your booking link has been copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const downloadQRCode = () => {
    const svg = document.getElementById("qr-code");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    canvas.width = qrSize;
    canvas.height = qrSize;

    img.onload = () => {
      if (!ctx) return;
      // Fill with white background for print-friendly QR codes
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, qrSize, qrSize);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${organization?.slug}-qr-code.png`;
        link.click();
        URL.revokeObjectURL(url);
        toast({
          title: "QR code downloaded!",
          description: "Your QR code has been saved as a PNG file",
        });
      });
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="text-page-title">
            Share Your Booking Link
          </h1>
          <p className="text-muted-foreground mb-4">
            Share this link with your patients so they can book appointments and register with your clinic
          </p>
          <ClinicNav />
        </div>

        <div className="space-y-6">
          {/* Booking Link Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5" />
                Your Booking Link
              </CardTitle>
              <CardDescription>
                Share this link on social media, in your bio, or send it directly to patients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {locations && locations.length > 1 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Location</label>
                  <Select
                    value={selectedLocationId || locations[0]?.id}
                    onValueChange={setSelectedLocationId}
                  >
                    <SelectTrigger data-testid="select-location">
                      <SelectValue placeholder="Choose a location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Patients who register through this link will be associated with {organization?.name} - {selectedLocation?.name || 'this location'}
                  </p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Input
                  value={bookingUrl}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="input-booking-url"
                />
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
                  size="icon"
                  data-testid="button-copy-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={copyToClipboard}
                  variant="default"
                  className="flex-1 min-w-[200px]"
                  data-testid="button-copy-full"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  onClick={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")}
                  variant="outline"
                  className="flex-1 min-w-[200px]"
                  data-testid="button-preview"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Preview Link
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                QR Code
              </CardTitle>
              <CardDescription>
                Download this QR code to display in your clinic or on marketing materials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg">
                <QRCodeSVG
                  id="qr-code"
                  value={bookingUrl}
                  size={qrSize}
                  level="H"
                  includeMargin={true}
                  data-testid="qr-code-display"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-foreground min-w-[100px]">
                    QR Code Size:
                  </label>
                  <select
                    value={qrSize}
                    onChange={(e) => setQrSize(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="select-qr-size"
                  >
                    <option value="128">Small (128px)</option>
                    <option value="256">Medium (256px)</option>
                    <option value="512">Large (512px)</option>
                    <option value="1024">Extra Large (1024px)</option>
                  </select>
                </div>

                <Button
                  onClick={downloadQRCode}
                  variant="default"
                  className="w-full"
                  data-testid="button-download-qr"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download QR Code
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Usage Tips Card */}
          <Card className="bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">How to Use Your Booking Link</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Social Media Bio:</strong> Add this link to your Instagram, Facebook, or TikTok bio so patients can easily book</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>QR Code:</strong> Print and display the QR code at your reception desk or on business cards</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Email Signature:</strong> Include the link in your email signature for easy sharing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Marketing Materials:</strong> Add the QR code to flyers, brochures, and promotional materials</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Website:</strong> Embed this link on your website's "Book Now" button</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

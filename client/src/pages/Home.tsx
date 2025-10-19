import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { 
  Gem, Calendar, Crown, Brain, Settings, Waves, Smartphone, 
  ArrowUp, ArrowDown, Rocket, Headset, Shield, Twitter, 
  Linkedin, Instagram, Check 
} from "lucide-react";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // Redirect logged-in users to their dashboards
  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'super_admin') {
        navigate('/super-admin');
      } else if (user.role === 'clinic_admin' || user.role === 'staff') {
        navigate('/clinic/dashboard');
      } else if (user.role === 'patient') {
        navigate('/patient/dashboard');
      }
    }
  }, [user, isLoading, navigate]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const { data: subscriptionPlans } = useQuery<Array<{
    id: string;
    name: string;
    tier: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number;
    features: string[];
    limits: { platformCommissionRate: number };
  }>>({
    queryKey: ['/api/subscription-plans'],
  });

  return (
    <div className="bg-background font-sans text-foreground">
      <Navigation />
      
      {/* Hero Section */}
      <section className="luxury-gradient py-20 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl lg:text-7xl font-serif font-bold text-foreground mb-6 leading-tight" data-testid="text-hero-title">
              Luxury Beauty & Wellness Management
            </h1>
            <p className="text-xl lg:text-2xl text-muted-foreground mb-8 leading-relaxed" data-testid="text-hero-subtitle">
              The only AI-powered platform that transforms beauty practices into luxury experiences. From booking to billing, memberships to marketing - all in one elegant solution.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button className="bg-primary text-primary-foreground px-8 py-4 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors" data-testid="button-start-trial">
                  Start Free Trial
                </Button>
              </Link>
              <Button 
                variant="outline"
                className="border-2 border-primary text-primary px-8 py-4 rounded-lg text-lg font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => scrollToSection('pricing')}
                data-testid="button-view-pricing"
              >
                View Pricing
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Overview */}
      <section id="features" className="py-20 bg-card">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-serif font-bold text-foreground mb-6" data-testid="text-features-title">
              Comprehensive Beauty Business Solution
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Everything you need to run, grow, and scale your luxury beauty practice with AI-powered insights and automation.
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            {/* Smart Scheduling */}
            <Card className="bg-background rounded-xl shadow-sm border border-border">
              <CardContent className="p-8">
                <div className="w-12 h-12 gold-shimmer rounded-lg flex items-center justify-center mb-6">
                  <Calendar className="text-primary-foreground text-xl" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-foreground mb-4" data-testid="text-feature-scheduling">
                  Smart Scheduling
                </h3>
                <p className="text-muted-foreground mb-6">
                  Intelligent appointment booking with AI-powered conflict detection, waitlist management, and automated reminders.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Drag & drop calendar interface</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Automated waitlist filling</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Smart conflict detection</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Membership Management */}
            <Card className="bg-background rounded-xl shadow-sm border border-border">
              <CardContent className="p-8">
                <div className="w-12 h-12 gold-shimmer rounded-lg flex items-center justify-center mb-6">
                  <Crown className="text-primary-foreground text-xl" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-foreground mb-4" data-testid="text-feature-membership">
                  Membership Tiers
                </h3>
                <p className="text-muted-foreground mb-6">
                  Create luxury membership programs with perks, rewards, and recurring billing powered by Stripe.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Configurable tier benefits</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Automatic billing & renewals</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Loyalty point system</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className="bg-background rounded-xl shadow-sm border border-border">
              <CardContent className="p-8">
                <div className="w-12 h-12 gold-shimmer rounded-lg flex items-center justify-center mb-6">
                  <Brain className="text-primary-foreground text-xl" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-foreground mb-4" data-testid="text-feature-ai">
                  AI-Powered Growth
                </h3>
                <p className="text-muted-foreground mb-6">
                  Get intelligent recommendations for upselling, churn prevention, and business optimization.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Personalized upsell suggestions</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Churn prediction & prevention</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="text-primary text-sm" />
                    <span>Revenue forecasting</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Platform Overview Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Super Admin HQ */}
            <Card className="bg-background rounded-xl shadow-sm border border-border">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <Settings className="text-primary text-lg" />
                  <h4 className="text-lg font-semibold text-foreground" data-testid="text-super-admin-title">Super Admin HQ</h4>
                </div>
                <p className="text-muted-foreground text-sm mb-4">Your command center for managing the entire platform</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Plan & billing management</li>
                  <li>• Organization analytics</li>
                  <li>• Revenue tracking</li>
                  <li>• Usage monitoring</li>
                </ul>
              </CardContent>
            </Card>

            {/* Clinic Dashboard */}
            <Card className="bg-background rounded-xl shadow-sm border border-border">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <Waves className="text-primary text-lg" />
                  <h4 className="text-lg font-semibold text-foreground" data-testid="text-clinic-dashboard-title">Clinic Dashboard</h4>
                </div>
                <p className="text-muted-foreground text-sm mb-4">Complete practice management for beauty professionals</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Staff & provider management</li>
                  <li>• Client relationship tools</li>
                  <li>• Multi-location support</li>
                  <li>• Performance analytics</li>
                </ul>
              </CardContent>
            </Card>

            {/* Patient Portal */}
            <Card className="bg-background rounded-xl shadow-sm border border-border">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <Smartphone className="text-primary text-lg" />
                  <h4 className="text-lg font-semibold text-foreground" data-testid="text-patient-portal-title">Patient Portal</h4>
                </div>
                <p className="text-muted-foreground text-sm mb-4">Seamless client experience from booking to billing</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Self-service booking</li>
                  <li>• Membership management</li>
                  <li>• Rewards tracking</li>
                  <li>• AI concierge chat</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 luxury-gradient">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-serif font-bold text-foreground mb-6" data-testid="text-pricing-title">
              Choose Your Growth Plan
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Simple, transparent pricing to grow your practice. Professional for core features, Enterprise for premium capabilities.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-4xl mx-auto">{subscriptionPlans && subscriptionPlans.map((plan) => {
              const isPopular = plan.tier === 'enterprise';
              const commission = plan.limits?.platformCommissionRate || 0;
              
              return (
                <Card
                  key={plan.id}
                  className={`rounded-xl ${
                    isPopular
                      ? 'bg-card shadow-lg border-2 border-primary relative'
                      : 'bg-card shadow-sm border border-border'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-medium">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-8">
                    <div className="text-center mb-8">
                      <h3 className="text-2xl font-semibold text-foreground mb-2" data-testid={`text-plan-${plan.tier}`}>
                        {plan.name}
                      </h3>
                      <div className="text-4xl font-bold text-foreground mb-1">
                        ${plan.monthlyPrice}
                      </div>
                      <div className="text-muted-foreground text-sm mb-2">/month</div>
                      <div className="text-sm text-primary font-medium">
                        {commission}% platform commission
                      </div>
                    </div>
                    
                    <ul className="space-y-3 mb-8">
                      {plan.features.slice(0, 6).map((feature, index) => (
                        <li key={index} className="flex items-start space-x-3">
                          <Check className="text-primary mt-0.5 flex-shrink-0" size={18} />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Link href={`/subscribe?plan=${plan.tier}`}>
                      <Button
                        className={`w-full ${
                          isPopular
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-background text-foreground border-2 border-border hover:bg-accent'
                        }`}
                        data-testid={`button-plan-${plan.tier}`}
                      >
                        Get Started
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-8">
            <p className="text-muted-foreground">All plans include 30-day free trial • No setup fees • Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 luxury-gradient">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-serif font-bold text-foreground mb-6" data-testid="text-contact-title">
              Ready to Transform Your Practice?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join hundreds of beauty professionals who've elevated their business with Aesthiq's AI-powered platform.
            </p>
            
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="text-center">
                <div className="w-16 h-16 gold-shimmer rounded-full flex items-center justify-center mx-auto mb-4">
                  <Rocket className="text-primary-foreground text-2xl" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Quick Setup</h3>
                <p className="text-muted-foreground">Get started in minutes with our guided onboarding wizard</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 gold-shimmer rounded-full flex items-center justify-center mx-auto mb-4">
                  <Headset className="text-primary-foreground text-2xl" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">24/7 Support</h3>
                <p className="text-muted-foreground">Dedicated support team available whenever you need help</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 gold-shimmer rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="text-primary-foreground text-2xl" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Secure & Compliant</h3>
                <p className="text-muted-foreground">HIPAA compliant with enterprise-grade security</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button className="bg-primary text-primary-foreground px-8 py-4 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors" data-testid="button-start-trial-footer">
                  Start Your Free Trial
                </Button>
              </Link>
              <Button 
                variant="outline"
                className="border-2 border-primary text-primary px-8 py-4 rounded-lg text-lg font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                data-testid="button-schedule-demo"
              >
                Schedule Demo
              </Button>
            </div>

            <p className="text-muted-foreground mt-6">14-day free trial • No credit card required • Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 gold-shimmer rounded-lg flex items-center justify-center">
                  <Gem className="text-primary-foreground text-sm" />
                </div>
                <span className="text-xl font-serif font-bold text-foreground">Aesthiq</span>
              </div>
              <p className="text-muted-foreground mb-4">Luxury beauty & wellness management platform powered by AI.</p>
              <div className="flex items-center space-x-4">
                <a href="#" className="text-muted-foreground hover:text-primary" data-testid="link-twitter">
                  <Twitter className="w-5 h-5" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-primary" data-testid="link-linkedin">
                  <Linkedin className="w-5 h-5" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-primary" data-testid="link-instagram">
                  <Instagram className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors" data-testid="footer-link-features">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors" data-testid="footer-link-pricing">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-security">Security</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-integrations">Integrations</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-about">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-blog">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-careers">Careers</a></li>
                <li><a href="#contact" className="hover:text-foreground transition-colors" data-testid="footer-link-contact">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Support</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-help">Help Center</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-docs">Documentation</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-community">Community</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-status">Status</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-muted-foreground">© 2024 Aesthiq. All rights reserved.</p>
            <div className="flex items-center space-x-6 text-muted-foreground mt-4 md:mt-0">
              <a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-privacy">Privacy Policy</a>
              <a href="#" className="hover:text-foreground transition-colors" data-testid="footer-link-terms">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
